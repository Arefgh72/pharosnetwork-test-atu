// main.js (نسخه ۲ - اصلاح شده)

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
        try {
            return JSON.parse(data);
        } catch (e) {
            console.log("فایل amounts.json قابل خواندن نبود. یک فایل جدید ساخته می‌شود.");
            return {};
        }
    }
    return {};
}

function writeAndCommitAmounts(amountsToSave) {
    console.log("در حال ذخیره مقادیر جدید در فایل amounts.json...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    try {
        console.log("در حال commit و push کردن تغییرات به ریپازیتوری...");
        execSync('git config --global user.email "action@github.com"');
        execSync('git config --global user.name "GitHub Action Bot"');
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        execSync('git commit -m "Update token amounts via script"');
        execSync("git push");
        console.log("فایل مقادیر با موفقیت در ریپازیتوری آپدیت شد.");
    } catch (error) {
        console.error("خطا در هنگام commit کردن فایل. ممکن است در اجرای بعدی به مشکل بخورید.", error.stdout?.toString());
    }
}

async function runTask(taskName) {
    console.log(`\n--- شروع عملیات: ${taskName} | ساعت: ${new Date().toUTCString()} ---`);
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 دقیقه

    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const dex1Router = new ethers.Contract(config.ADDRESSES.DEX_1_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const dex2Router = new ethers.Contract(config.ADDRESSES.DEX_2_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);
    
    // اضافه کردن یک gasLimit ثابت برای جلوگیری از خطای تخمین
    const options = { gasLimit: 500000 }; 

    switch (taskName) {
        case "WRAP_2":
            await wrapper2.deposit({ value: ethers.utils.parseEther("0.001"), ...options });
            break;

        case "SWAP_TO_USDC_OLD":
            // ** استفاده از تابع اصلاح شده **
            const swapToUsdcOldTx = await dex1Router.swapExactETHForTokens(
                0, // amountOutMin
                [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.USDC_OLD],
                wallet.address,
                deadline,
                { value: ethers.utils.parseEther("0.001"), ...options }
            );
            await swapToUsdcOldTx.wait();
            const usdcOldBalance = await usdcOldToken.balanceOf(wallet.address);
            amounts.USDC_OLD_amount = usdcOldBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        case "WRAP_1":
            await wrapper1.deposit({ value: ethers.utils.parseEther("0.01"), ...options });
            break;

        case "SWAP_TO_TETHER":
            // ** استفاده از تابع اصلاح شده **
            const swapToTetherTx = await dex1Router.swapExactETHForTokens(
                0,
                [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.TETHER_USD],
                wallet.address,
                deadline,
                { value: ethers.utils.parseEther("0.001"), ...options }
            );
            await swapToTetherTx.wait();
            const tetherBalance = await tetherToken.balanceOf(wallet.address);
            amounts.TETHER_USD_amount = tetherBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        // ... بقیه تسک‌ها بدون تغییر باقی می‌مانند چون از روترها یا توابع دیگری استفاده می‌کنند که مشکلی نداشتند ...
        // ... (کد بقیه تسک‌ها مثل قبل است) ...
        case "SWAP_TETHER_TO_USDC":
            const tetherAmountToSwap = amounts.TETHER_USD_amount;
            if (!tetherAmountToSwap || tetherAmountToSwap === "0") throw new Error("مقدار تتر برای سواپ یافت نشد.");
            const approveTx1 = await tetherToken.approve(config.ADDRESSES.DEX_2_ROUTER, tetherAmountToSwap);
            await approveTx1.wait();
            // این تابع برای روتر ۲ سفارشی است
            const swapTetherTx = await dex2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                config.ADDRESSES.TETHER_USD,
                config.ADDRESSES.USDC,
                3000, // fee
                wallet.address, // recipient
                deadline,
                tetherAmountToSwap, // amountIn
                0, // amountOutMinimum
                0, // sqrtPriceLimitX96
                options
            );
            await swapTetherTx.wait();
            const usdcBalance = await usdcToken.balanceOf(wallet.address);
            amounts.USDC_amount = usdcBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        case "SWAP_USDC_OLD_TO_PHRS":
             const usdcOldAmountToSwap = amounts.USDC_OLD_amount;
            if (!usdcOldAmountToSwap || usdcOldAmountToSwap === "0") throw new Error("مقدار USDC_OLD برای سواپ یافت نشد.");
            const approveTx2 = await usdcOldToken.approve(config.ADDRESSES.DEX_2_ROUTER, usdcOldAmountToSwap);
            await approveTx2.wait();
            // این تابع برای روتر ۲ سفارشی است
            await dex2Router.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                config.ADDRESSES.USDC_OLD,
                config.ADDRESSES.WRAPPER_1, // مسیر به PHRS از طریق WPHRS
                3000, // fee
                wallet.address, // recipient
                deadline,
                usdcOldAmountToSwap, // amountIn
                0, // amountOutMinimum
                0, // sqrtPriceLimitX96
                options
            );
            break;
            
        case "SWAP_USDC_TO_PHRS":
            const usdcAmountToSwap = amounts.USDC_amount;
            if (!usdcAmountToSwap || usdcAmountToSwap === "0") throw new Error("مقدار USDC برای سواپ یافت نشد.");
            const approveTx3 = await usdcToken.approve(config.ADDRESSES.DEX_1_ROUTER, usdcAmountToSwap);
            await approveTx3.wait();
            await dex1Router.swapExactTokensForTokens(
                usdcAmountToSwap,
                0,
                [config.ADDRESSES.USDC, config.ADDRESSES.WRAPPER_2],
                wallet.address,
                deadline,
                options
            );
            console.log("مرحله ۱ (تبدیل به WPHRS) انجام شد.");
            const wphrsBalance = await wrapper2.balanceOf(wallet.address);
            if (wphrsBalance.gt(0)) {
               console.log(`مقدار ${ethers.utils.formatEther(wphrsBalance)} WPHRS برای Unwrap کردن وجود دارد.`);
               await wrapper2.withdraw(wphrsBalance, options);
               console.log("مرحله ۲ (Unwrap) انجام شد.");
            } else {
               console.log("موجودی WPHRS برای Unwrap کردن صفر است. مرحله دوم نادیده گرفته شد.");
            }
            break;

        case "UNWRAP_2":
            await wrapper2.withdraw(ethers.utils.parseEther("0.001"), options);
            break;

        case "UNWRAP_1":
            await wrapper1.withdraw(ethers.utils.parseEther("0.01"), options);
            break;
        default:
            console.error(`خطا: تسک ناشناخته "${taskName}"`);
            process.exit(1);
    }
    console.log(`--- عملیات ${taskName} با موفقیت به پایان رسید ---`);
}

const taskToRun = process.argv[2];
if (!taskToRun) {
    console.error("خطا: لطفاً نام تسک را به عنوان آرگومان وارد کنید.");
    process.exit(1);
}
runTask(taskToRun).catch(error => {
    console.error(`!!! خطای کلی در اجرای تسک ${taskToRun} !!!`);
    console.error(error.reason || error.message);
    process.exit(1);
});
