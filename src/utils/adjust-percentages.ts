import BigNumber from "bignumber.js"

export default function adjustPercentages(input: number[]): bigint[] {
  const ONE_E_18 = 1_000_000_000_000_000_000n;    // 1e18

  // Convert all percentages to bigint scaled by 1e16
  let scaled = input.map(val => BigInt(new BigNumber(val).multipliedBy(1e16).toFixed(0)));

  // Sum the scaled values
  let sum = scaled.reduce((acc, cur) => acc + cur, 0n);

  // If already equals 1e18, just return
  if (sum === ONE_E_18) {
    return scaled;
  }

  // Calculate delta
  let delta = ONE_E_18 - sum;
  let length = BigInt(scaled.length);

  // Check if we can distribute delta among all items
  if (delta === 0n) {
    // No adjustment needed
    return scaled;
  }

  // We need to see if |delta| is large enough to distribute at least 1 unit per item
  if (delta < 0n ? -delta >= length : delta >= length) {
    // Attempt even distribution
    let perItem = delta / length; // integer division
    for (let i = 0; i < scaled.length; i++) {
      scaled[i] += perItem;
    }

    // Check new sum
    let newSum = scaled.reduce((acc, cur) => acc + cur, 0n);
    if (newSum === ONE_E_18) {
      // Done
      return scaled;
    } else {
      // Remainder or mismatch still exists, adjust only the last one
      let finalDelta = ONE_E_18 - newSum;
      scaled[scaled.length - 1] += finalDelta;
      return scaled;
    }
  } else {
    // |delta| too small to distribute at least ±1 across all items; fallback to last item
    scaled[scaled.length - 1] += delta;
    return scaled;
  }
}
