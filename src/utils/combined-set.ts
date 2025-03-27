export default class CombinedSet<T> extends Set<T> {
  constructor(values?: readonly T[] | null) {
    super(values)
  }

  public toArray() {
    return Array.from(super.values())
  }

  public filter(predicate: (value: T, index: number, array: T[]) => boolean) {
    return new CombinedSet(this.toArray().filter(predicate))
  }

  public map(predicate: (value: T, index: number, obj: T[]) => T) {
    return new CombinedSet(this.toArray().map(predicate))
  }

  public some(predicate: (value: T, index: number, array: T[]) => boolean) {
    return this.toArray().some(predicate)
  }

  public find(predicate: (value: T, index: number, obj: T[]) => boolean) {
    return this.toArray().find(predicate)
  }

  public findIndex(predicate: (value: T, index: number, obj: T[]) => boolean) {
    return this.toArray().findIndex(predicate)
  }
}
