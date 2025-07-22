import { Address, avalanche, base, bnb, mainnet, matic, optimism } from "@safeblock/blockchain-utils"
import { contractAddresses } from "~/config"
import { TokensListExtension, PriceStorageExtension } from "~/extensions"
import { SdkConfig } from "~/sdk"
import { BasicToken } from "~/types"

const bnbDAI = { // DAI
  address: Address.from("0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3"),
  decimals: 18,
  network: bnb
}

const baseUSDC = { // DAI
  address: Address.from("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
  decimals: 6,
  network: base
}

const baseWETH = { // DAI
  address: Address.from("0x4200000000000000000000000000000000000006"),
  decimals: 18,
  network: base
}

const mainnetUSDT = { // USDT
  address: Address.from("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
  decimals: 6,
  network: mainnet
}

const mainnetUSDC = { // USDT
  address: Address.from("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
  decimals: 6,
  network: mainnet
}

const mainnetETH = { // ETH
  address: Address.from(Address.zeroAddress),
  decimals: 18,
  network: mainnet
}

const bnbUSDT = { // USDT
  address: Address.from("0x55d398326f99059fF775485246999027B3197955"),
  decimals: 18,
  network: bnb
}

const bnbBNB = {
  address: Address.from(Address.zeroAddress),
  decimals: 18,
  network: bnb
}

const bnbUSDC = { // USDT
  address: Address.from("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"),
  decimals: 18,
  network: bnb
}

const bnbDOGE = {
  address: Address.from("0xbA2aE424d960c26247Dd6c32edC70B295c744C43"),
  decimals: 8,
  network: bnb
}

const maticUSDC = {
  address: Address.from("0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),
  decimals: 6,
  network: matic
}

const maticUSDT = {
  address: Address.from("0xc2132D05D31c914a87C6611C10748AEb04B58e8F"),
  decimals: 6,
  network: matic
}

const maticWMATIC = {
  address: Address.from(Address.wrappedOf(matic)),
  decimals: 18,
  network: matic
}

const bnbWBNB = {
  address: Address.from(Address.wrappedOf(bnb)),
  decimals: 18,
  network: bnb
}

const maticMATIC = {
  address: Address.from(Address.zeroAddress),
  decimals: 18,
  network: matic
}

export const bnbCAKE = {
  address: Address.from("0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82"),
  decimals: 18,
  network: bnb
}

const tokensListExtensionConfig: Record<string, BasicToken[]> = {
  [bnb.name]: [bnbUSDT, bnbDAI, bnbDOGE, bnbUSDC, bnbWBNB, bnbBNB, bnbCAKE],
  [matic.name]: [maticUSDC, maticUSDT, maticMATIC, maticWMATIC],
  [mainnet.name]: [mainnetUSDT, mainnetETH, mainnetUSDC],
  [base.name]: [baseWETH, baseUSDC],
  [avalanche.name]: [
    { address: Address.from(Address.zeroAddress), decimals: 18, network: avalanche },
    { address: Address.from(contractAddresses.usdcParams(avalanche).address), decimals: 6, network: avalanche }
  ],
  [optimism.name]: [
    { address: Address.from(Address.zeroAddress), decimals: 18, network: optimism },
    { address: Address.from(contractAddresses.usdcParams(optimism).address), decimals: 6, network: optimism }
  ]
}

const sdkConfig: SdkConfig = {
  routePriceDifferenceLimit: 20,
  //debugLogListener: console.log,
  backend: {
    url: "https://api.safeblock.cc"
  },
  extensions: env => [
    new TokensListExtension(env.sdk, env.eventBus, tokensListExtensionConfig),
    new PriceStorageExtension(env.sdk, env.eventBus, {
      updateInterval: 10_000
    })
  ]
}

export {
  bnbDOGE,
  bnbBNB,
  bnbDAI,
  bnbUSDT,
  maticUSDT,
  maticUSDC,
  mainnetUSDT,
  mainnetETH,
  mainnetUSDC,
  maticMATIC,
  bnbUSDC,
  bnbWBNB,
  baseWETH,
  maticWMATIC,
  baseUSDC,

  sdkConfig,
  tokensListExtensionConfig
}
