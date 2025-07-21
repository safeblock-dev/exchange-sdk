import { exchangeConstants } from "~/config"
import { RouteStep } from "~/types"


export default function convertPairsToHex(route: RouteStep[], splitPairSteps: true): string[][]
export default function convertPairsToHex(route: RouteStep[]): string[]

export default function convertPairsToHex(route: RouteStep[], splitPairSteps = false) {
  if (route.length === 0) return []

  const result = route.map(i => {
    const address = i.address.toString().slice(2)

    const version = exchangeConstants.versionsMap[i.version]
    const fee = i.version === "uniswap_v2" && !i.fee
      ? exchangeConstants.defaultV2Fee.padStart(6, "0")
      : i.fee.toString(16).padStart(6, "0")

    const emptySpaceLength = 63 - (address.length + fee.length + version.length)
    const emptySpace = new Array(emptySpaceLength).fill("0").join("")

    const isSolidly = i.fee_algorithm ? i.fee_algorithm.split("/").slice(-1)[0] === "solidly" ? 1 : 0 : 0

    return `0x${ version }${ emptySpace }${ isSolidly }${ fee }${ address }`
  })

  if (!splitPairSteps) return result

  return result.map(i => [i])
}
