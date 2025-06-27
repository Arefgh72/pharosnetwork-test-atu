// config.js (نسخه ۴ - نهایی)

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
            "function balanceOf(address owner) view returns (uint256)"
        ],
        // ABI برای روترها با توابع صحیح
        DEX_ROUTER: [
            // تابع multicall برای روتر دکس ۱
            "function multicall(uint256 deadline, bytes[] calldata data) external payable",
            
            // توابع داخلی که در multicall استفاده می‌شوند (برای انکد کردن)
            "function sweepToken(address token, uint256 amountMinimum, address recipient)",
            "function unwrapWETH9(uint256 amountMinimum, address recipient)",
            "function refundETH()",
            
            // توابع استاندارد برای روتر دکس ۲
            "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
        ]
    }
};

module.exports = config;
