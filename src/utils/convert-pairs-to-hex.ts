import { exchangeConstants } from "~/config"
import { RouteStep } from "~/types"

export default function convertPairsToHex(route: RouteStep[]) {
  if (route.length === 0) return []

  return route.map(i => {
    const address = i.address.toString().slice(2)
    // const fee = ExchangeConstants.DefaultV2Fee.padStart(6, "0")

    const version = exchangeConstants.versionsMap[i.version]
    const fee = i.version === "uniswap_v2" && !i.fee
      ? exchangeConstants.defaultV2Fee.padStart(6, "0")
      : i.fee.toString(16).padStart(6, "0")

    const emptySpaceLength = 64 - (address.length + fee.length + version.length)
    const emptySpace = new Array(emptySpaceLength).fill("0").join("")

    return `0x${ version }${ emptySpace }${ fee }${ address }`
  })
}
