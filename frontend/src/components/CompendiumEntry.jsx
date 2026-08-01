// A single reusable entry card for the Compendium screen (Plan v3). Locked
// entries render as a masked "???" placeholder — name, description, and
// distinguishing details are hidden, but the icon slot still shows a lock
// glyph so the player knows content exists there without spoiling it.
export default function CompendiumEntry({ entry }) {
  if (!entry.unlocked) {
    return (
      <div className="pc-offer pc-comp-locked">
        <div className="pc-oi">🔒</div>
        <div>
          <div className="pc-on">???</div>
          <div className="pc-od">Alcanza el nivel {entry.unlockRequirement?.minLevel ?? '?'} para desbloquear.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="pc-offer">
      <div className="pc-oi">{entry.icon}</div>
      <div>
        <div className="pc-on">
          {entry.name}
          {entry.rarity && <span className={`pc-rarity pc-rarity-${entry.rarity}`}>{entry.rarity}</span>}
          {entry.boss && <span className="pc-rarity pc-rarity-boss">boss</span>}
          {entry.asymmetric && <span className="pc-rarity pc-rarity-elite">elite/boss</span>}
          {entry.archetypeLabel && <span className="pc-archetype-tag">{entry.archetypeIcon} {entry.archetypeLabel}</span>}
        </div>
        <div className="pc-od">{entry.desc}</div>
        {entry.familyLabel && <div className="pc-od pc-comp-family">{entry.familyLabel}</div>}
        {entry.quote && <div className="pc-quote">“{entry.quote}”</div>}
        {entry.hasUpgrade && <div className="pc-od pc-comp-upgrade">Mejora: {entry.upgradeDesc}</div>}
        {entry.drawbackLabel && <div className="pc-drawback">⚠ {entry.drawbackLabel}</div>}
      </div>
    </div>
  )
}
