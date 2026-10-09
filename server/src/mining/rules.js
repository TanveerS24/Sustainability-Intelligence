/**
 * Apriori / FP-Growth style association rule mining — implemented from scratch.
 * Uses an Apriori candidate generation approach for correctness and simplicity.
 * Items are strings; transactions are arrays of strings.
 */
import cfg from '../config.js';

/**
 * Count item support in transactions.
 * @param {string[][]} transactions
 * @param {string[]} itemset
 * @returns {number} support count
 */
function countSupport(transactions, itemset) {
  const set = new Set(itemset);
  return transactions.filter(t => itemset.every(item => t.includes(item))).length;
}

/**
 * Generate all size-k candidate itemsets from frequent (k-1) itemsets.
 */
function generateCandidates(freqItems, k) {
  const seen = new Set();
  const candidates = [];
  const arr = [...freqItems];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i], b = arr[j];
      if (k === 2) {
        const cand = [a[0], b[0]].sort();
        const key = cand.join('|');
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(cand);
        }
      } else {
        if (a.slice(0, -1).join('|') === b.slice(0, -1).join('|')) {
          const cand = Array.from(new Set([...a, b[b.length - 1]])).sort();
          if (cand.length === k) {
            const key = cand.join('|');
            if (!seen.has(key)) {
              seen.add(key);
              candidates.push(cand);
            }
          }
        }
      }
    }
  }
  return candidates;
}

/**
 * Mine frequent itemsets using Apriori.
 * @param {string[][]} transactions
 * @param {number} minSupport fraction [0,1]
 * @param {number} maxSize maximum itemset size to consider
 * @returns {Map<string, number>} itemset key -> support count
 */
function apriori(transactions, minSupport, maxSize = 4) {
  const n = transactions.length;
  const minCount = Math.ceil(minSupport * n);
  const allFrequent = new Map(); // key -> count

  // Frequency 1
  const itemCounts = new Map();
  for (const t of transactions) {
    for (const item of t) {
      itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
    }
  }
  let freqItems = [];
  for (const [item, count] of itemCounts) {
    if (count >= minCount) {
      freqItems.push([item]);
      allFrequent.set(item, count);
    }
  }

  // Larger itemsets
  for (let k = 2; k <= maxSize && freqItems.length > 0; k++) {
    const candidates = generateCandidates(freqItems.map(f => Array.isArray(f) && f.length === 1 ? f : f), k);
    const nextFreq = [];
    for (const cand of candidates) {
      const key = cand.join('|');
      const count = countSupport(transactions, cand);
      if (count >= minCount) {
        allFrequent.set(key, count);
        nextFreq.push(cand);
      }
    }
    freqItems = nextFreq;
  }

  return allFrequent;
}

/**
 * Generate association rules from frequent itemsets.
 * Keep only rules where consequent is a usage-level item.
 */
export function mineRules(transactions, opts = {}) {
  const {
    minSupport = cfg.MIN_SUPPORT,
    minConfidence = cfg.MIN_CONFIDENCE,
    maxRules = cfg.MAX_RULES_PER_CLUSTER,
  } = opts;

  if (transactions.length === 0) return [];
  const n = transactions.length;
  const frequent = apriori(transactions, minSupport);

  const rules = [];

  // For each frequent itemset of size >= 2, generate rules
  for (const [key, suppCount] of frequent) {
    const items = key.split('|');
    if (items.length < 2) continue;

    // Try each item as consequent
    for (let ci = 0; ci < items.length; ci++) {
      const consequent = items[ci];
      // Only keep rules where consequent is a usage-level item
      if (!consequent.startsWith('usage:')) continue;

      const antecedent = items.filter((_, i) => i !== ci);
      const antKey = antecedent.join('|');
      const antCount = frequent.get(antKey) || countSupport(transactions, antecedent);
      if (antCount === 0) continue;

      const support = suppCount / n;
      const confidence = suppCount / antCount;
      if (confidence < minConfidence) continue;

      // Consequent support for lift
      const consCount = frequent.get(consequent) || countSupport(transactions, [consequent]);
      const lift = confidence / (consCount / n);

      rules.push({
        antecedent: antecedent.join(', '),
        consequent,
        support,
        confidence,
        lift,
        explanation: buildExplanation(antecedent, consequent, { support, confidence, lift }),
      });
    }
  }

  // Deduplicate and rank by lift, cap per cluster
  const seen = new Set();
  const unique = rules.filter(r => {
    const k = `${r.antecedent}=>${r.consequent}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return unique.sort((a, b) => b.lift - a.lift).slice(0, maxRules);
}

function buildExplanation(antecedent, consequent, { support, confidence, lift }) {
  const usageWord = consequent.replace('usage:', '');
  const antStr = antecedent.join(' and ');
  const pct = (v) => (v * 100).toFixed(1);
  return (
    `Households with ${antStr} tend to have ${usageWord} consumption ` +
    `(support ${pct(support)}%, confidence ${pct(confidence)}%, lift ${lift.toFixed(2)}x). ` +
    `This means ${pct(confidence)}% of days with these conditions show ${usageWord} usage, ` +
    `${lift.toFixed(2)}x more than average.`
  );
}
