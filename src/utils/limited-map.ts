export default class LimitedMap<K, V> {
  private readonly _map = new Map<K, [number, V]>()

  constructor(private readonly limit = 10_000) {}

  public set(key: K, value: V, expireAfter = 10_000) {
    if (this._map.size > this.limit) this._map.delete(Array.from(this._map.keys()).slice(-1)[0])

    return this._map.set(key, [Date.now() + expireAfter, value])
  }

  public get(key: K): V | null {
    const value = this._map.get(key)

    if (!value) return null
    if (Date.now() > value[0]) {
      this._map.delete(key)
      return null
    }

    return value[1]
  }
}
