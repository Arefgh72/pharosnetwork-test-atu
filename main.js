// main.js (نسخه ۵ - حل نهایی و با قابلیت دیباگ)

const { ethers } = require("ethers");
const fs =require("fs");
const { execSync } = require("child_process");
const config = require("./config.js");

// -- بخش تنظیمات اولیه --
const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("خطا: کلید خصوصی (PRIVATE_KEY) در GitHub Secrets تعریف نشده است.");
    process.exit(1);
}
const wallet = new ethers.Wallet(privateKey, provider);

// -- توابع کمکی --
async function checkBalance() {
    const balance = await wallet.getBalance();
    const minBalance = ethers.utils.parseEther("0.001");
    console.log(`\nموجودی فعلی: ${ethers.utils.formatEther(balance)} PHRS`);
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
    console.log(">> در حال ذخیره مقادیر جدید در فایل amounts.json...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    try {
        console.log(">> در حال commit و push کردن تغییرات...");
        execSync('git config --global user.email "action@github.com"');
        execSync('git config --global user.name "GitHub Action Bot"');
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        execSync('git commit -m "Update token amounts via script"');
        execSync("git push");
        console.log("✅ فایل مقادیر با موفقیت در ریپازیتوری آپدیت شد.");
    } catch (error) {
        console.error("خطا در هنگام commit کردن فایل.", error.stdout?.toString());
    }
}

// تابع جدید برای ارسال و تایید تراکنش با دیباگ
async function sendAndConfirmTransaction(txRequest, description) {
    console.log(`>> در حال ارسال تراکنش برای: ${description}...`);
    const tx = await wallet.sendTransaction(txRequest);
    console.log(`☑️ تراکنش ارسال شد. هش (Hash): ${tx.hash}`);
    console.log(">> در حال انتظار برای تایید تراکنش (حداکثر ۱۰ دقیقه)...");

    // منتظر تایید با زمان انتظار ۱۰ دقیقه‌ای
    const receipt = await provider.waitForTransaction(tx.hash, 1, 600000);
    
    // چک کردن وضعیت نهایی تراکنش
    if (receipt.status === 0) {
        throw new Error(`❌ تراکنش با هش ${tx.hash} ناموفق بود (reverted).`);
    }

    console.log(`✅ تراکنش با موفقیت تایید شد. بلاک: ${receipt.blockNumber}`);
    return receipt;
}


// --- تابع اصلی اجرای تسک‌ها (با منطق اصلاح شده) ---
async function runTask(taskName) {
    console.log(`\n--- شروع عملیات: ${taskName} ---`);
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const options = { gasLimit: 800000 }; // افزایش Gas Limit برای اطمینان بیشتر

    // تعریف قراردادها
    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);

    // ساخت داده تراکنش به صورت دستی برای روترهای سفارشی
    const buildDex1SwapData = (path) => '0x5ae401dc' + ethers.utils.defaultAbiCoder.encode(['uint256', 'address[]', 'address', 'uint256'], [0, path, wallet.address, deadline]).substring(2);
    const buildDex2SwapData = (tokenIn, tokenOut, amountIn) => '0xff84aafa' + ethers.utils.defaultAbiCoder.encode(['address', 'address', 'uint256', 'uint256', 'uint256'], [tokenIn, tokenOut, 3000, amountIn, 0]).substring(2);


    switch (taskName) {
        case "WRAP_2":
            await sendAndConfirmTransaction({
                to: wrapper2.address,
                data: wrapper2.interface.encodeFunctionData("deposit"),
                value: ethers.utils.parseEther("0.001"),
                ...options
            }, "Wrap 0.001 PHRS on Wrapper 2");
            break;

        case "SWAP_TO_USDC_OLD":
            await sendAndConfirmTransaction({
                to: config.ADDRESSES.DEX_1_ROUTER,
                data: buildDex1SwapData([config.ADDRESSES.WRAPPER_2, config.ADDRESSES.USDC_OLD]),
                value: ethers.utils.parseEther("0.001"),
                ...options
            }, "Swap PHRS to USDC_OLD");
            amounts.USDC_OLD_amount = (await usdcOldToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;

        case "WRAP_1":
            await sendAndConfirmTransaction({
                to: wrapper1.address,
                data: wrapper1.interface.encodeFunctionData("deposit"),
                value: ethers.utils.parseEther("0.01"),
                ...options
            }, "Wrap 0.01 PHRS on Wrapper 1");
            break;

        case "SWAP_TO_TETHER":
            await sendAndConfirmTransaction({
                to: config.ADDRESSES.DEX_1_ROUTER,
                data: buildDex1SwapData([config.ADDRESSES.WRAPPER_2, config.ADDRESSES.TETHER_USD]),
                value: ethers.utils.parseEther("0.001"),
                ...options
            }, "Swap PHRS to Tether USD");
            amounts.TETHER_USD_amount = (await tetherToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;

        case "SWAP_TETHER_TO_USDC":
            const tetherAmount = amounts.TETHER_USD_amount;
            if (!tetherAmount || tetherAmount === "0") throw new Error("مقدار تتر برای سواپ یافت نشد.");
            await sendAndConfirmTransaction({ to: tetherToken.address, data: tetherToken.interface.encodeFunctionData("approve", [config.ADDRESSES.DEX_2_ROUTER, tetherAmount]), ...options }, "Approve Tether for DEX 2");
            await sendAndConfirmTransaction({ to: config.ADDRESSES.DEX_2_ROUTER, data: buildDex2SwapData(config.ADDRESSES.TETHER_USD, config.ADDRESSES.USDC, tetherAmount), ...options }, "Swap Tether to USDC");
            amounts.USDC_amount = (await usdcToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;

        case "SWAP_USDC_OLD_TO_PHRS":
            const usdcOldAmount = amounts.USDC_OLD_amount;
            if (!usdcOldAmount || usdcOldAmount === "0") throw new Error("مقدار USDC_OLD برای سواپ یافت نشد.");
            await sendAndConfirmTransaction({ to: usdcOldToken.address, data: usdcOldToken.interface.encodeFunctionData("approve", [config.ADDRESSES.DEX_2_ROUTER, usdcOldAmount]), ...options }, "Approve USDC_OLD for DEX 2");
            await sendAndConfirmTransaction({ to: config.ADDRESSES.DEX_2_ROUTER, data: buildDex2SwapData(config.ADDRESSES.USDC_OLD, config.ADDRESSES.WRAPPER_1, usdcOldAmount), ...options }, "Swap USDC_OLD to WPHRS");
            break;

        case "SWAP_USDC_TO_PHRS":
            const usdcAmount = amounts.USDC_amount;
            if (!usdcAmount || usdcAmount === "0") throw new Error("مقدار USDC برای سواپ یافت نشد.");
            await sendAndConfirmTransaction({ to: usdcToken.address, data: usdcToken.interface.encodeFunctionData("approve", [config.ADDRESSES.DEX_1_ROUTER, usdcAmount]), ...options }, "Approve USDC for DEX 1");
            await sendAndConfirmTransaction({ to: config.ADDRESSES.DEX_1_ROUTER, data: buildDex1SwapData([config.ADDRESSES.USDC, config.ADDRESSES.WRAPPER_2]), ...options, value: 0 }, "Swap USDC to WPHRS");
            const wphrsBalance = await wrapper2.balanceOf(wallet.address);
            if (wphrsBalance.gt(0)) {
                await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("withdraw", [wphrsBalance]), ...options, value: 0 }, "Unwrap WPHRS");
            }
            break;
            
        case "UNWRAP_2":
            await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.001")]), ...options, value: 0 }, "Unwrap 0.001 from Wrapper 2");
            break;

        case "UNWRAP_1":
            await sendAndConfirmTransaction({ to: wrapper1.address, data: wrapper1.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.01")]), ...options, value: 0 }, "Unwrap 0.01 from Wrapper 1");
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
            throw new Error(`تسک ناشناخته "${taskName}"`);
    }
}


// -- بخش اجرای اصلی --
const taskToRun = process.argv[2];
if (!taskToRun) {
    console.error("خطا: لطفاً نام تسک را به عنوان آرگومان وارد کنید.");
    process.exit(1);
}

runTask(taskToRun)
    .then(() => console.log(`\n✅✅✅ اجرای تسک ${taskToRun} موفقیت‌آمیز بود ✅✅✅`))
    .catch(error => {
        console.error(`\n❌❌❌ خطای کلی در اجرای تسک ${taskToRun} ❌❌❌`);
        console.error(error.reason || error.message);
        process.exit(1);
    });
