import BigNumber from "bignumber.js"

export default class ArrayUtils {
  public static randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]
  }

  public static shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]]
    }
    return array
  }

  public static exclude<T>(source: T[], ...exclusions: T[][]) {
    const excludeList = exclusions.flat()

    return source.filter(item => !excludeList.includes(item))
  }

  public static onlyUnique<T>(array: T[]): T[] {
    return Array.from(new Set(array))
  }

  public static nonNullable<T>(array: T[]): NonNullable<T>[] {
    return array.filter(Boolean) as any
  }

  public static async asyncNonNullable<T>(array: Promise<T[]>): Promise<NonNullable<T>[]> {
    return (await array).filter(Boolean) as any
  }

  public static async asyncMap<T, R>(array: Promise<T[]>, predicate: (item: T) => R): Promise<R[]> {
    const _array = await array

    return _array.map(predicate)
  }

  public static toChunks<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  public static safeReduce(arr: number[] | BigNumber[]): BigNumber {
    if (arr.length === 0) return new BigNumber(0)
    if (arr.length === 1) return new BigNumber(arr[0])

    return arr.map(v => new BigNumber(v)).reduce((a, b) => a.plus(b))
  }

  public static safeReduceInt(arr: bigint[]): bigint {
    if (arr.length === 0) return BigInt(0)
    if (arr.length === 1) return arr[0]

    return arr.reduce((a, b) => a + b)
  }

}
