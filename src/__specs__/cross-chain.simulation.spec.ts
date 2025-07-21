import { Address, Amount, bnb, ethersProvider } from "@safeblock/blockchain-utils"
import { describe, expect, it } from "vitest"
import { bnbBNB, bnbUSDT, maticUSDC, maticUSDT, sdkConfig } from "~/__specs__/utils/sdk-test-config"
import { PriceStorageExtension } from "~/extensions"
import SafeBlockSDK from "~/sdk"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { BasicToken, ExchangeRequest } from "~/types"

describe("Single chain simulation", async () => {
  const sdk = new SafeBlockSDK({
    ...sdkConfig,
    contractAddresses: {
      entryPoint: { default: "0x27d6b06f29802a19c6c1216D540758f32ebD8dE6" }
    }
  })

  const amountOutInitial = new Amount(1, bnbUSDT.decimals, true)
  await sdk.extension(PriceStorageExtension).forceRefetch()
  await sdk.extension(PriceStorageExtension).waitInitialFetch(1000)

  const provider = ethersProvider(bnb)

  if (!provider) throw new Error("provider is not defined")

  const feeData = await provider.getFeeData().catch(error => {
    return new SdkException("Cannot get fee data: " + String(error?.message), SdkExceptionCode.TransactionPrepareError)
  })

  if (feeData instanceof SdkException) throw feeData

  const createRequest = async (tokensOut: BasicToken[], percents: number[]) => {
    const request: ExchangeRequest = {
      exactInput: true,
      amountIn: new Amount(1, 18, true),
      amountsOut: Array(tokensOut.length).fill(amountOutInitial),
      amountOutReadablePercentages: percents,
      tokenIn: bnbBNB,
      tokensOut: tokensOut,
      slippageReadablePercent: 1
    }

    const task = sdk.updateTask()
    const quota = await sdk.createQuota(Address.from("0x8894E0a0c962CB723c1976a4421c95949bE2D4E3"), request, task)

    if (quota instanceof Error) throw quota

    const executeTx = quota.executorCallData.slice(-1)[0]

    if (!executeTx) throw new Error("executeTx is not defined")

    return executeTx
  }

  it("should be able to execute one-to-one transactions", async () => {
    const executeTx = await createRequest([maticUSDT], [100])

    const callResult = await provider.call({
      data: executeTx.callData,
      chainId: executeTx.network.chainId,
      value: executeTx.value?.toBigNumber().toFixed(0),
      to: executeTx.to.toString(),
      gasPrice: feeData.gasPrice
    })

    expect(callResult).toEqual("0x")
  })

  it("should be able to execute one-to-many transactions", async () => {
    const executeTx = await createRequest([maticUSDC, maticUSDT], [50, 50])

    const callResult = await provider.call({
      data: executeTx.callData,
      chainId: executeTx.network.chainId,
      value: executeTx.value?.toBigNumber().toFixed(0),
      to: executeTx.to.toString(),
      gasPrice: feeData.gasPrice
    })

    expect(callResult).toEqual("0x")
  })
})