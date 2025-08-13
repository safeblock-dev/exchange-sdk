import SdkCore from "~/sdk/sdk-core"
import SdkException, { SdkExceptionCode } from "~/sdk/sdk-exception"
import { AggregationModuleRequestParams } from "~/types"

export default async function crossCurveAggregationModule(sdk: SdkCore, params: AggregationModuleRequestParams) {
  console.log(sdk, params)

  return new SdkException("Not implemented", SdkExceptionCode.InternalError)

  /*

    const unitsResponseA = await httpRequest({
    base: "https://api.crosscurve.fi",
    path: "/routing/scan",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      params: {
        chainIdOut: parseInt(request.tokensOut[0].network.chainId.toString()),
        tokenOut: contractAddresses.usdcParams(request.tokensOut[0].network).address.toString(),
        chainIdIn: parseInt(request.tokenIn.network.chainId.toString()),
        amountIn: request.tokenIn.address.equalTo(contractAddresses.usdcParams(request.tokenIn.network).address) ? sourceNetworkSendAmount.toBigNumber().multipliedBy(0.997).toFixed(0) : sourceNetworkSendAmount.toString(),
        tokenIn: contractAddresses.usdcParams(request.tokenIn.network).address.toString()
      },
      slippage: 1
    }
  })

  if (!unitsResponseA || !unitsResponseA.length) throw new SdkException("Cannot compute cross curve exchange: A", SdkExceptionCode.InternalError)

  const unitsResponseB = await httpRequest({
    base: "https://api.crosscurve.fi",
    path: "/estimate",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: unitsResponseA[0]
  })

  if (!unitsResponseB) throw new SdkException("Cannot compute cross curve exchange: B", SdkExceptionCode.InternalError)

  const unitsFinalResponse = await httpRequest<BackendResponse.UnitsAPIResponse>({
    base: "https://api.crosscurve.fi",
    path: "/tx/create",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      from: contractAddresses.entryPoint(request.tokenIn.network, this.sdkConfig),
      recipient: request.destinationAddress?.toString() || from?.toString(),
      routing: unitsResponseA[0],
      estimate: unitsResponseB
    }
  })

  if (!unitsFinalResponse) throw new SdkException("Cannot compute cross curve exchange: final", SdkExceptionCode.InternalError)

  const crossCurveIface = CrossCurveFacet__factory.createInterface()

  sourceNetworkCallData.push(
    crossCurveIface.encodeFunctionData("startCrossCurve", [
      unitsFinalResponse.args[0],
      unitsFinalResponse.args[1],
      unitsFinalResponse.args[2]
    ])
  )

  nativeAmount = nativeAmount.plus(unitsFinalResponse.args[2].executionPrice)


   */
}