export function rollStickerReplyChance(chance) {
    if (chance <= 0)
        return { chance, roll: null, hit: false };
    if (chance >= 100)
        return { chance, roll: null, hit: true };
    const roll = Math.random() * 100;
    return { chance, roll, hit: roll < chance };
}
