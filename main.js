// main.js (نسخه ۴ - حل نهایی مشکل روتر)

const { ethers } = require("ethers");
const fs = require("fs");
const { execSync } = require("child_process");
const config = require("./config.js");

const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("خطا: کلید خصوصی (PRIVATE_KEY) در GitHub Secrets تعریف نشده است.");
    process.exit(1);
}
const wallet = new ethers.Wallet(privateKey, provider);

// ... توابع کمکی checkBalance, readAmounts, writeAndCommitAmounts بدون تغییر باقی می‌مانند ...
async function checkBalance() {
    const balance = await wallet.getBalance();
    const minBalance = ethers.utils.parseEther("0.001");
    console.log(`موجودی فعلی: ${ethers.utils.formatEther(balance)} PHRS`);
    if (balance.lt(minBalance)) {
        console.error("خطا: موجودی برای پرداخت هزینه تراکنش کافی نیست. عملیات لغو شد.");
        process.exit(1);
    }
}

function readAmounts() {
    if (fs.existsSync(config.AMOUNTS_FILE_PATH)) {
        const data = fs.readFileSync(config.AMOUNTS_FILE_PATH, "utf8");
        try { return JSON.parse(data); } catch (e) { return {}; }
    }
    return {};
}

function writeAndCommitAmounts(amountsToSave) {
    console.log("در حال ذخیره مقادیر جدید در فایل amounts.json...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    try {
        console.log("در حال commit و push کردن تغییرات...");
        execSync('git config --global user.email "action@github.com"');
        execSync('git config --global user.name "GitHub Action Bot"');
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        execSync('git commit -m "Update token amounts via script"');
        execSync("git push");
        console.log("فایل مقادیر با موفقیت آپدیت شد.");
    } catch (error) {
        console.error("خطا در هنگام commit کردن فایل.", error.stdout?.toString());
    }
}


// --- تابع اصلی اجرای تسک‌ها (با منطق اصلاح شده) ---
async function runTask(taskName) {
    console.log(`\n--- شروع عملیات: ${taskName} ---`);
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const options = { gasLimit: 600000 }; // کمی افزایش Gas Limit برای اطمینان

    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const dex1Router = new ethers.Contract(config.ADDRESSES.DEX_1_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const dex2Router = new ethers.Contract(config.ADDRESSES.DEX_2_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);

    // --- تابع جدید برای ساخت دستی داده تراکنش برای روتر ۱ ---
    function buildDex1SwapData(path) {
        // این تابع دقیقا ساختار داده تراکنش موفق شما را بازسازی می‌کند
        const functionSelector = '0x5ae401dc';
        const coder = new ethers.utils.defaultAbiCoder();
        // این ساختار پارامترها بر اساس تحلیل تراکنش‌های موفق شماست
        const encodedParams = coder.encode(
            ['uint256', 'address[]', 'address', 'uint256'],
            [0, path, wallet.address, deadline]
        );
        return functionSelector + encodedParams.substring(2);
    }
    
    // --- انتخاب عملیات بر اساس نام تسک ---
    switch (taskName) {
        case "WRAP_2":
            await wrapper2.deposit({ value: ethers.utils.parseEther("0.001"), ...options });
            break;

        case "SWAP_TO_USDC_OLD":
            const path_to_usdc_old = [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.USDC_OLD];
            const data_usdc_old = buildDex1SwapData(path_to_usdc_old);
            const tx_usdc_old = await wallet.sendTransaction({
                to: config.ADDRESSES.DEX_1_ROUTER,
                value: ethers.utils.parseEther("0.001"),
                data: data_usdc_old,
                ...options
            });
            await tx_usdc_old.wait();
            amounts.USDC_OLD_amount = (await usdcOldToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;

        case "WRAP_1":
            await wrapper1.deposit({ value: ethers.utils.parseEther("0.01"), ...options });
            break;

        case "SWAP_TO_TETHER":
            const path_to_tether = [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.TETHER_USD];
            const data_tether = buildDex1SwapData(path_to_tether);
            const tx_tether = await wallet.sendTransaction({
                to: config.ADDRESSES.DEX_1_ROUTER,
                value: ethers.utils.parseEther("0.001"),
                data: data_tether,
                ...options
            });
            await tx_tether.wait();
            amounts.TETHER_USD_amount = (await tetherToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;

        // ... بقیه تسک‌ها که از روتر ۱ استفاده نمی‌کنند، بدون تغییر باقی می‌مانند ...
        // (این بخش‌ها قبلاً اصلاح شده بودند و درست کار می‌کنند)
        case "SWAP_TETHER_TO_USDC":
            const tetherAmount = amounts.TETHER_USD_amount;
            if (!tetherAmount || tetherAmount === "0") throw new Error("مقدار تتر برای سواپ یافت نشد.");
            await (await tetherToken.approve(config.ADDRESSES.DEX_2_ROUTER, tetherAmount)).wait();
            await (await dex2Router.swapExactTokensForTokens(tetherAmount, 0, [config.ADDRESSES.TETHER_USD, config.ADDRESSES.USDC], wallet.address, deadline, options)).wait();
            amounts.USDC_amount = (await usdcToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        case "SWAP_USDC_OLD_TO_PHRS":
            const usdcOldAmount = amounts.USDC_OLD_amount;
            if (!usdcOldAmount || usdcOldAmount === "0") throw new Error("مقدار USDC_OLD برای سواپ یافت نشد.");
            await (await usdcOldToken.approve(config.ADDRESSES.DEX_2_ROUTER, usdcOldAmount)).wait();
            await (await dex2Router.swapExactTokensForETH(usdcOldAmount, 0, [config.ADDRESSES.USDC_OLD, config.ADDRESSES.WRAPPER_1], wallet.address, deadline, options)).wait();
            break;
        case "SWAP_USDC_TO_PHRS":
            const usdcAmount = amounts.USDC_amount;
            if (!usdcAmount || usdcAmount === "0") throw new Error("مقدار USDC برای سواپ یافت نشد.");
            const path_usdc_to_wphrs = [config.ADDRESSES.USDC, config.ADDRESSES.WRAPPER_2];
            const data_usdc_to_wphrs = buildDex1SwapData(path_usdc_to_wphrs); // از همان تابع کمکی برای روتر ۱ استفاده می‌کنیم
             await (await usdcToken.approve(config.ADDRESSES.DEX_1_ROUTER, usdcAmount)).wait();
            const tx_usdc_to_phrs = await wallet.sendTransaction({
                to: config.ADDRESSES.DEX_1_ROUTER,
                data: data_usdc_to_wphrs, // اینجا هم باید داده را دستی بسازیم
                ...options
            });
            await tx_usdc_to_phrs.wait();
            const wphrsBalance = await wrapper2.balanceOf(wallet.address);
            if (wphrsBalance.gt(0)) await wrapper2.withdraw(wphrsBalance, options);
            break;
            
        case "UNWRAP_2":
            await wrapper2.withdraw(ethers.utils.parseEther("0.001"), options);
            break;
        case "UNWRAP_1":
            await wrapper1.withdraw(ethers.utils.parseEther("0.01"), options);
            break;

        case "TEST_ALL":
            console.log("!!! شروع تست کامل تمام مراحل !!!");
            await runTask("WRAP_2");
            await runTask("SWAP_TO_USDC_OLD");
            await runTask("WRAP_1");
            await runTask("SWAP_TO_TETHER");
            await runTask("SWAP_TETHER_TO_USDC");
            await runTask("SWAP_USDC_OLD_TO_PHRS");
            await runTask("SWAP_USDC_TO_PHRS");
            await runTask("UNWRAP_2");
            await runTask("UNWRAP_1");
            console.log("!!! تست کامل با موفقیت به پایان رسید !!!");
            break;
        default:
            console.error(`خطا: تسک ناشناخته "${taskName}"`);
            process.exit(1);
    }
}

// ... بخش اجرای اصلی (بدون تغییر) ...
const taskToRun = process.argv[2];
if (!taskToRun) {
    console.error("خطا: لطفاً نام تسک را به عنوان آرگومان وارد کنید.");
    process.exit(1);
}
runTask(taskToRun)
    .then(() => console.log(`\n--- اجرای تسک ${taskToRun} موفقیت‌آمیز بود ---`))
    .catch(error => {
        console.error(`!!! خطای کلی در اجرای تسک ${taskToRun} !!!`);
        console.error(error.reason || error.message);
        process.exit(1);
    });
