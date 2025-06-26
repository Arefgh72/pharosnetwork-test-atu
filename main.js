// main.js

const { ethers } = require("ethers");
const fs = require("fs");
const { execSync } = require("child_process");
const config = require("./config.js");

// -- بخش تنظیمات اولیه --

// اتصال به شبکه از طریق RPC URL
const provider = new ethers.providers.JsonRpcProvider(config.RPC_URL);

// دریافت کلید خصوصی از GitHub Secrets
const privateKey = process.env.PRIVATE_KEY;
if (!privateKey) {
    console.error("خطا: کلید خصوصی (PRIVATE_KEY) در GitHub Secrets تعریف نشده است.");
    process.exit(1);
}

// ساخت نمونه کیف پول
const wallet = new ethers.Wallet(privateKey, provider);

// -- بخش توابع کمکی --

/**
 * موجودی توکن اصلی شبکه (PHRS) را چک می‌کند.
 * اگر موجودی کمتر از 0.001 باشد، اسکریپت را متوقف می‌کند.
 */
async function checkBalance() {
    const balance = await wallet.getBalance();
    const minBalance = ethers.utils.parseEther("0.001");
    console.log(`موجودی فعلی: ${ethers.utils.formatEther(balance)} PHRS`);
    if (balance.lt(minBalance)) {
        console.error("خطا: موجودی برای پرداخت هزینه تراکنش کافی نیست. عملیات لغو شد.");
        process.exit(1); // خروج از اسکریپت
    }
}

/**
 * مقادیر ذخیره شده را از فایل amounts.json می‌خواند.
 * @returns {object} - آبجکتی شامل مقادیر ذخیره شده
 */
function readAmounts() {
    if (fs.existsSync(config.AMOUNTS_FILE_PATH)) {
        const data = fs.readFileSync(config.AMOUNTS_FILE_PATH, "utf8");
        return JSON.parse(data);
    }
    // اگر فایل وجود نداشت، یک آبجکت خالی برمی‌گرداند
    return {};
}

/**
 * مقادیر جدید را در فایل amounts.json می‌نویسد و تغییرات را به ریپازیتوری گیت‌هاب commit و push می‌کند.
 * @param {object} amountsToSave - آبجکت جدید مقادیر برای ذخیره
 */
function writeAndCommitAmounts(amountsToSave) {
    console.log("در حال ذخیره مقادیر جدید در فایل amounts.json...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    
    try {
        console.log("در حال commit و push کردن تغییرات به ریپازیتوری...");
        // تنظیمات git برای اکشن
        execSync('git config --global user.email "action@github.com"');
        execSync('git config --global user.name "GitHub Action Bot"');
        
        // افزودن، کامیت و پوش کردن فایل
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        execSync('git commit -m "Update token amounts via script"');
        execSync("git push");
        
        console.log("فایل مقادیر با موفقیت در ریپازیتوری آپدیت شد.");
    } catch (error) {
        console.error("خطا در هنگام commit و push کردن فایل:", error);
        // اگر پوش کردن به مشکل بخورد، برنامه متوقف نمی‌شود ولی خطا را نمایش می‌دهد
    }
}

// -- بخش توابع اصلی عملیات --

async function runTask(taskName) {
    console.log(`\n--- شروع عملیات: ${taskName} | ساعت: ${new Date().toUTCString()} ---`);
    
    // قبل از هر کاری، موجودی را چک کن
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10; // 10 دقیقه فرصت

    // تعریف قراردادها
    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const dex1Router = new ethers.Contract(config.ADDRESSES.DEX_1_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const dex2Router = new ethers.Contract(config.ADDRESSES.DEX_2_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);
    

    // --- انتخاب عملیات بر اساس نام تسک ---
    switch (taskName) {
        // 01:00
        case "WRAP_2":
            await wrapper2.deposit({ value: ethers.utils.parseEther("0.001") });
            break;

        // 02:00
        case "SWAP_TO_USDC_OLD":
            const swapToUsdcOldTx = await dex1Router.swapExactETHForTokens(
                0, // amountOutMin
                [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.USDC_OLD], // path: PHRS -> WPHRS -> USDC_OLD
                wallet.address,
                deadline,
                { value: ethers.utils.parseEther("0.001") }
            );
            await swapToUsdcOldTx.wait();
            const usdcOldBalance = await usdcOldToken.balanceOf(wallet.address);
            amounts.USDC_OLD_amount = usdcOldBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        // 03:00
        case "WRAP_1":
            await wrapper1.deposit({ value: ethers.utils.parseEther("0.01") });
            break;

        // 06:00
        case "SWAP_TO_TETHER":
            const swapToTetherTx = await dex1Router.swapExactETHForTokens(
                0,
                [config.ADDRESSES.WRAPPER_2, config.ADDRESSES.TETHER_USD], // path: PHRS -> WPHRS -> TETHER
                wallet.address,
                deadline,
                { value: ethers.utils.parseEther("0.001") }
            );
            await swapToTetherTx.wait();
            const tetherBalance = await tetherToken.balanceOf(wallet.address);
            amounts.TETHER_USD_amount = tetherBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        // 09:00
        case "SWAP_TETHER_TO_USDC":
            const tetherAmountToSwap = amounts.TETHER_USD_amount;
            if (!tetherAmountToSwap) throw new Error("مقدار تتر برای سواپ یافت نشد.");
            await tetherToken.approve(config.ADDRESSES.DEX_2_ROUTER, tetherAmountToSwap);
            await dex2Router.swapExactTokensForTokens(
                tetherAmountToSwap,
                0,
                [config.ADDRESSES.TETHER_USD, config.ADDRESSES.USDC],
                wallet.address,
                deadline
            );
            const usdcBalance = await usdcToken.balanceOf(wallet.address);
            amounts.USDC_amount = usdcBalance.toString();
            writeAndCommitAmounts(amounts);
            break;

        // 16:00
        case "SWAP_USDC_OLD_TO_PHRS":
            const usdcOldAmountToSwap = amounts.USDC_OLD_amount;
            if (!usdcOldAmountToSwap) throw new Error("مقدار USDC_OLD برای سواپ یافت نشد.");
            await usdcOldToken.approve(config.ADDRESSES.DEX_2_ROUTER, usdcOldAmountToSwap);
            await dex2Router.swapExactTokensForETH(
                usdcOldAmountToSwap,
                0,
                [config.ADDRESSES.USDC_OLD, config.ADDRESSES.WRAPPER_1], // Path to native token via wrapper
                wallet.address,
                deadline
            );
            break;

        // 18:00
        case "SWAP_USDC_TO_PHRS":
            const usdcAmountToSwap = amounts.USDC_amount;
            if (!usdcAmountToSwap) throw new Error("مقدار USDC برای سواپ یافت نشد.");
            // Step 1: Swap USDC to WPHRS (Wrapper 2)
            await usdcToken.approve(config.ADDRESSES.DEX_1_ROUTER, usdcAmountToSwap);
            await dex1Router.swapExactTokensForTokens(
                usdcAmountToSwap,
                0,
                [config.ADDRESSES.USDC, config.ADDRESSES.WRAPPER_2],
                wallet.address,
                deadline
            );
            console.log("مرحله ۱ (تبدیل به WPHRS) انجام شد.");
            // Step 2: Unwrap the received WPHRS
            const wphrsBalance = await wrapper2.balanceOf(wallet.address);
            console.log(`مقدار ${ethers.utils.formatEther(wphrsBalance)} WPHRS برای Unwrap کردن وجود دارد.`);
            await wrapper2.withdraw(wphrsBalance);
            console.log("مرحله ۲ (Unwrap) انجام شد.");
            break;

        // 20:00
        case "UNWRAP_2":
            await wrapper2.withdraw(ethers.utils.parseEther("0.001"));
            break;

        // 23:00
        case "UNWRAP_1":
            await wrapper1.withdraw(ethers.utils.parseEther("0.01"));
            break;

        default:
            console.error(`خطا: تسک ناشناخته "${taskName}"`);
            process.exit(1);
    }
    console.log(`--- عملیات ${taskName} با موفقیت به پایان رسید ---`);
}


// -- بخش اجرای اصلی --

// نام تسک از آرگومان‌های خط فرمان خوانده می‌شود
// مثال: node main.js WRAP_1
const taskToRun = process.argv[2];

if (!taskToRun) {
    console.error("خطا: لطفاً نام تسک را به عنوان آرگومان وارد کنید.");
    console.log("مثال: node main.js WRAP_1");
    process.exit(1);
}

// اجرای تسک با کنترل خطا
runTask(taskToRun).catch(error => {
    console.error(`!!! خطای کلی در اجرای تسک ${taskToRun} !!!`);
    console.error(error);
    process.exit(1);
});
