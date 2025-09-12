import { Address } from "@safeblock/blockchain-utils"
import { AbiCoder } from "ethers"
import { TransferFaucet__factory } from "~/abis/types"
import { AggregationModuleRequestParams } from "~/types"

export default function buildExtraData(params: AggregationModuleRequestParams) {
  const transferFacetIface = TransferFaucet__factory.createInterface()

  const dataToEncode: string[] = []

  if (params.outputTokens.some(a => a.address.equalTo(Address.zeroAddress))) {
    dataToEncode.push(transferFacetIface.encodeFunctionData("unwrapNativeAndTransferTo", [params.receiverAddress]))
    if (params.outputTokens.length > 1) {
      dataToEncode.push(
        transferFacetIface.encodeFunctionData("transferToken", [
          params.receiverAddress,
          params.outputTokens.map(t => t.address.toString())
            .filter(a => !Address.equal(a, Address.zeroAddress))
        ])
      )
    }
  }
  else {
    dataToEncode.push(
      transferFacetIface.encodeFunctionData("transferToken", [
        params.receiverAddress,
        params.outputTokens.map(t => t.address.toString())
      ])
    )
  }

  return AbiCoder.defaultAbiCoder().encode(["bytes[]"], [dataToEncode])
}