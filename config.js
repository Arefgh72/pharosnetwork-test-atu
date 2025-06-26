// config.js

// در این فایل، تمام آدرس‌ها، نام‌ها و ABI های لازم برای پروژه را به صورت متمرکز نگهداری می‌کنیم.
// این کار باعث می‌شود اسکریپت اصلی تمیزتر و خواناتر باشد.

const config = {
    // اطلاعات شبکه
    RPC_URL: "https://testnet.dplabs-internal.com",
    CHAIN_ID: 688688,

    // نام فایل برای ذخیره مقادیر
    AMOUNTS_FILE_PATH: "./amounts.json",

    // آدرس‌های قراردادها و توکن‌ها
    ADDRESSES: {
        WRAPPER_1: "0x3019B247381c850ab53Dc0EE53bCe7A07Ea9155f",
        WRAPPER_2: "0x76aaaDA469D23216bE5f7C596fA25F282Ff9b364",
        DEX_1_ROUTER: "0x1A4DE519154Ae51200b0Ad7c90F7faC75547888a",
        DEX_2_ROUTER: "0x3541423f25A1Ca5C98fdBCf478405d3f0aaD1164",
        USDC_OLD: "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37",
        TETHER_USD: "0xd4071393f8716661958f766df660033b3d35fd29",
        USDC: "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced",
    },

    // ABI ها (Application Binary Interface) - ساختار توابع قراردادهای هوشمند
    ABIS: {
        // ABI برای قراردادهای Wrapper (WPHRS)
        WRAPPER: [
            "function deposit() payable",
            "function withdraw(uint256 amount)",
            "function balanceOf(address owner) view returns (uint256)"
        ],

        // ABI استاندارد برای توکن‌های ERC20
        ERC20: [
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function balanceOf(address owner) view returns (uint256)"
        ],

        // ABI برای روترهای DEX (شامل توابع رایج سواپ)
        DEX_ROUTER: [
            // تابع برای تبدیل توکن اصلی شبکه به توکن
            "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
            
            // تابع برای تبدیل توکن به توکن اصلی شبکه
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",

            // تابع برای تبدیل توکن به توکن دیگر
            "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
        ]
    }
};

// ماژول را اکسپورت می‌کنیم تا در فایل main.js قابل استفاده باشد
module.exports = config;
