// main.js (نسخه ۱۳ - اصلاح نهایی گیرنده توکن)

const { ethers } = require("ethers");
const fs = require("fs");
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
        console.log(">> در حال بررسی برای commit و push کردن تغییرات...");
        execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
        const status = execSync('git status --porcelain').toString();
        if (status) {
            console.log(">> تغییرات جدید یافت شد، در حال کامیت کردن...");
            execSync('git config --global user.email "action@github.com"');
            execSync('git config --global user.name "GitHub Action Bot"');
            execSync('git commit -m "Update token amounts via script"');
            execSync("git push");
            console.log("✅ فایل مقادیر با موفقیت در ریپازیتوری آپدیت شد.");
        } else {
            console.log("ℹ️ تغییری در مقادیر برای ثبت وجود نداشت. از کامیت صرف نظر شد.");
        }
    } catch (error) {
        console.error("خطا در هنگام commit کردن فایل:", error.message.split('\n')[0]);
    }
}
async function sendAndConfirmTransaction(txRequest, description) {
    console.log(`>> در حال ارسال تراکنش برای: ${description}...`);
    const tx = await wallet.sendTransaction(txRequest);
    console.log(`☑️ تراکنش ارسال شد. هش (Hash): ${tx.hash}`);
    console.log(">> در حال انتظار برای تایید تراکنش (حداکثر ۱۰ دقیقه)...");
    const receipt = await provider.waitForTransaction(tx.hash, 1, 600000);
    if (receipt.status === 0) {
        throw new Error(`❌ تراکنش با هش ${tx.hash} ناموفق بود (reverted).`);
    }
    console.log(`✅ تراکنش با موفقیت تایید شد. بلاک: ${receipt.blockNumber}`);
    return receipt;
}

// --- تابع اصلی اجرای تسک‌ها ---
async function runTask(taskName) {
    console.log(`\n--- شروع عملیات: ${taskName} ---`);
    await checkBalance();

    const amounts = readAmounts();
    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
    const options = { gasLimit: 800000 };

    const wrapper1 = new ethers.Contract(config.ADDRESSES.WRAPPER_1, config.ABIS.WRAPPER, wallet);
    const wrapper2 = new ethers.Contract(config.ADDRESSES.WRAPPER_2, config.ABIS.WRAPPER, wallet);
    const dex1Router = new ethers.Contract(config.ADDRESSES.DEX_1_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const dex2Router = new ethers.Contract(config.ADDRESSES.DEX_2_ROUTER, config.ABIS.DEX_ROUTER, wallet);
    const usdcOldToken = new ethers.Contract(config.ADDRESSES.USDC_OLD, config.ABIS.ERC20, wallet);
    const tetherToken = new ethers.Contract(config.ADDRESSES.TETHER_USD, config.ABIS.ERC20, wallet);
    const usdcToken = new ethers.Contract(config.ADDRESSES.USDC, config.ABIS.ERC20, wallet);

    switch (taskName) {
        // ... تمام کیس‌های موفق قبلی بدون تغییر ...
        case "WRAP_2":
            await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("deposit"), value: ethers.utils.parseEther("0.001"), ...options }, "Wrap 0.001 PHRS on Wrapper 2");
            break;
        case "WRAP_1":
            await sendAndConfirmTransaction({ to: wrapper1.address, data: wrapper1.interface.encodeFunctionData("deposit"), value: ethers.utils.parseEther("0.01"), ...options }, "Wrap 0.01 PHRS on Wrapper 1");
            break;
        case "UNWRAP_2":
            await sendAndConfirmTransaction({ to: wrapper2.address, data: wrapper2.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.001")]), ...options }, "Unwrap 0.001 from Wrapper 2");
            break;
        case "UNWRAP_1":
            await sendAndConfirmTransaction({ to: wrapper1.address, data: wrapper1.interface.encodeFunctionData("withdraw", [ethers.utils.parseEther("0.01")]), ...options }, "Unwrap 0.01 from Wrapper 1");
            break;
        case "SWAP_TO_USDC_OLD": {
            const dataPayload = [dex1Router.interface.encodeFunctionData("refundETH")];
            await sendAndConfirmTransaction({ to: dex1Router.address, data: dex1Router.interface.encodeFunctionData("multicall", [deadline, dataPayload]), value: ethers.utils.parseEther("0.001"), ...options }, "Swap PHRS to USDC_OLD via multicall");
            amounts.USDC_OLD_amount = (await usdcOldToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_TO_TETHER": {
            const dataPayload = [dex1Router.interface.encodeFunctionData("refundETH")];
            await sendAndConfirmTransaction({ to: dex1Router.address, data: dex1Router.interface.encodeFunctionData("multicall", [deadline, dataPayload]), value: ethers.utils.parseEther("0.001"), ...options }, "Swap PHRS to Tether USD via multicall");
            amounts.TETHER_USD_amount = (await tetherToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_TETHER_TO_USDC": {
            const tetherAmount = amounts.TETHER_USD_amount;
            if (!tetherAmount || tetherAmount === "0") throw new Error("مقدار تتر برای سواپ یافت نشد.");
            await sendAndConfirmTransaction({ to: tetherToken.address, data: tetherToken.interface.encodeFunctionData("approve", [dex2Router.address, tetherAmount]), ...options }, "Approve Tether for DEX 2");
            await sendAndConfirmTransaction({ to: dex2Router.address, data: dex2Router.interface.encodeFunctionData("swapExactTokensForTokens", [tetherAmount, 0, [config.ADDRESSES.TETHER_USD, config.ADDRESSES.USDC], wallet.address, deadline]), ...options }, "Swap Tether to USDC");
            amounts.USDC_amount = (await usdcToken.balanceOf(wallet.address)).toString();
            writeAndCommitAmounts(amounts);
            break;
        }
        case "SWAP_USDC_OLD_TO_PHRS": {
            const usdcOldAmount = amounts.USDC_OLD_amount;
            if (!usdcOldAmount || usdcOldAmount === "0") throw new Error("مقدار USDC_OLD برای سواپ یافت نشد.");
            await sendAndConfirmTransaction({ to: usdcOldToken.address, data: usdcOldToken.interface.encodeFunctionData("approve", [dex2Router.address, usdcOldAmount]), ...options }, "Approve USDC_OLD for DEX 2");
            await sendAndConfirmTransaction({ to: dex2Router.address, data: dex2Router.interface.encodeFunctionData("swapExactTokensForETH", [usdcOldAmount, 0, [config.ADDRESSES.USDC_OLD, config.ADDRESSES.WRAPPER_1], wallet.address, deadline]), ...options }, "Swap USDC_OLD to PHRS");
            break;
        }

        // ******** اصلاح نهایی و کلیدی در این بخش ********
        case "SWAP_USDC_TO_PHRS": {
            const usdcAmount = amounts.USDC_amount;
            if (!usdcAmount || usdcAmount === "0") throw new Error("مقدار USDC برای سواپ یافت نشد.");
            
            await sendAndConfirmTransaction({ to: usdcToken.address, data: usdcToken.interface.encodeFunctionData("approve", [dex1Router.address, usdcAmount]), ...options }, "Approve USDC for DEX 1");
            
            // در اینجا 'گیرنده' توکن خود روتر است تا بتواند از آن استفاده کند.
            const dataPayload = [
                dex1Router.interface.encodeFunctionData("sweepToken", [config.ADDRESSES.USDC, usdcAmount, dex1Router.address]), // **تغییر کلیدی**
                dex1Router.interface.encodeFunctionData("unwrapWETH9", [0, wallet.address])
            ];

            await sendAndConfirmTransaction({ to: dex1Router.address, data: dex1Router.interface.encodeFunctionData("multicall", [deadline, dataPayload]), ...options }, "Swap USDC to PHRS via multicall");
            break;
        }

        // --- تسک تست ---
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

const taskToRun = process.argv[2];
if (!taskToRun) {
    console.error("خطا: لطفاً نام تسک را به عنوان آرگومان وارد کنید.");
    process.exit(1);
}
runTask(taskToRun)
    .then(() => console.log(`\n✅✅✅ اجرای تسک ${taskToRun} موفقیت‌آمیز بود ✅✅✅`))
    .catch(error => {
        console.error(`\n❌❌❌ خطای کلی در اجرای تسک ${taskToRun} ❌❌❌`);
        console.error(error.reason || error.message || error);
        process.exit(1);
    });
