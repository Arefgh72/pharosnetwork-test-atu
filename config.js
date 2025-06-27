// config.js (نسخه ۲ - اصلاح شده)

const config = {
    RPC_URL: "https://testnet.dplabs-internal.com",
    CHAIN_ID: 688688,
    AMOUNTS_FILE_PATH: "./amounts.json",

    ADDRESSES: {
        WRAPPER_1: "0x3019B247381c850ab53Dc0EE53bCe7A07Ea9155f",
        WRAPPER_2: "0x76aaaDA469D23216bE5f7C596fA25F282Ff9b364",
        DEX_1_ROUTER: "0x1A4DE519154Ae51200b0Ad7c90F7faC75547888a",
        DEX_2_ROUTER: "0x3541423f25A1Ca5C98fdBCf478405d3f0aaD1164",
        USDC_OLD: "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37",
        TETHER_USD: "0xd4071393f8716661958f766df660033b3d35fd29",
        USDC: "0x72df0bcd7276f2dfbac900d1ce63c272c4bccced",
    },

    ABIS: {
        WRAPPER: [
            "function deposit() payable",
            "function withdraw(uint256 amount)",
            "function balanceOf(address owner) view returns (uint256)"
        ],
        ERC20: [
            "function approve(address spender, uint256 amount) returns (bool)",
            "function allowance(address owner, address spender) view returns (uint256)",
            "function balanceOf(address owner) view returns (uint256)"
        ],
        // --- ABI اصلاح شده برای روترها ---
        DEX_ROUTER: [
            // تابع استاندارد برای تبدیل توکن به توکن
            "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
            // تابع استاندارد برای تبدیل توکن به توکن اصلی شبکه
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
            
            // !! تابع سفارشی برای روتر ۱ که از داده تراکنش شما استخراج شد !!
            "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",

            // !! تابع سفارشی برای روتر ۲ (بر اساس داده‌های تراکنش شما) !!
            "function swapExactTokensForTokensSupportingFeeOnTransferTokens(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) external payable"
        ]
    }
};

module.exports = config;
