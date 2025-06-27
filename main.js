// فقط این تابع را جایگزین کنید
function writeAndCommitAmounts(amountsToSave) {
    console.log(">> در حال ذخیره مقادیر جدید در فایل amounts.json...");
    fs.writeFileSync(config.AMOUNTS_FILE_PATH, JSON.stringify(amountsToSave, null, 2));
    
    try {
        console.log(">> در حال بررسی برای commit و push کردن تغییرات...");
        
        // این دستور چک می‌کند آیا تغییری برای کامیت وجود دارد یا نه
        const status = execSync('git status --porcelain').toString();
        
        // فقط در صورتی کامیت کن که تغییری وجود داشته باشد
        if (status) {
            execSync('git config --global user.email "action@github.com"');
            execSync('git config --global user.name "GitHub Action Bot"');
            execSync(`git add ${config.AMOUNTS_FILE_PATH}`);
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
