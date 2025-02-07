import { Address, bnb, mainnet, matic, ton } from "@safeblock/blockchain-utils"
import { SdkConfig } from "~/sdk"

const bnbDAI = { // DAI
  address: Address.from("0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3"),
  decimals: 18,
  network: bnb
}

const mainnetUSDT = { // USDT
  address: Address.from("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
  decimals: 6,
  network: mainnet
}

const bnbUSDT = { // USDT
  address: Address.from("0x55d398326f99059fF775485246999027B3197955"),
  decimals: 18,
  network: bnb
}

const bnbDOGE = {
  address: Address.from("0xbA2aE424d960c26247Dd6c32edC70B295c744C43"),
  decimals: 8,
  network: bnb
}

const maticUSDC = {
  address: Address.from("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"),
  decimals: 6,
  network: matic
}

const maticUSDT = {
  address: Address.from("0xc2132D05D31c914a87C6611C10748AEb04B58e8F"),
  decimals: 6,
  network: matic
}

const tonUSDT = {
  address: Address.from("EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"),
  decimals: 6,
  network: ton
}

const tonNOT = {
  address: Address.from("EQAvlWFDxGF2lXm67y4yzC17wYKD9A0guwPkMs1gOsM__NOT"),
  decimals: 9,
  network: ton
}

const tonDOGS = {
  address: Address.from("EQCvxJy4eG8hyHBFsZ7eePxrRsUQSFE_jpptRAYBmcG_DOGS"),
  decimals: 9,
  network: ton
}

const sdkConfig: SdkConfig = {
  routePriceDifferenceLimit: 20,
  tokensList: {
    [bnb.name]: [bnbUSDT, bnbDAI, bnbDOGE],
    [matic.name]: [maticUSDC, maticUSDT],
    [ton.name]: [tonUSDT, tonNOT, tonDOGS],
    [mainnet.name]: [mainnetUSDT]
  },
  backend: {
    url: "https://api.safeblock.com"
  },
  priceStorage: {
    updateInterval: 10_000
  }
}

export {
  bnbDOGE,
  bnbDAI,
  bnbUSDT,
  maticUSDT,
  maticUSDC,
  mainnetUSDT,
  tonUSDT,
  tonNOT,
  tonDOGS,
  sdkConfig
}