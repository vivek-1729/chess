export type Style = 'aggressive' | 'balanced' | 'defensive'

export type Bot = {
  id: string
  name: string
  reign: string
  elo: number
  style: Style
  bio: string
}

/** Ordered from Rome's worst rulers to its best. */
export const EMPERORS: Bot[] = [
  { id: 'elagabalus', name: 'Elagabalus', reign: '218–222', elo: 400, style: 'aggressive', bio: 'Smothered dinner guests in rose petals. Plays with the same care.' },
  { id: 'caligula', name: 'Caligula', reign: '37–41', elo: 600, style: 'aggressive', bio: 'Tried to make his horse a consul. Moves his pieces with similar judgment.' },
  { id: 'nero', name: 'Nero', reign: '54–68', elo: 800, style: 'balanced', bio: 'Fiddles while his kingside burns.' },
  { id: 'commodus', name: 'Commodus', reign: '180–192', elo: 950, style: 'aggressive', bio: 'Fought in the arena as a gladiator. Attacks everything, defends nothing.' },
  { id: 'caracalla', name: 'Caracalla', reign: '198–217', elo: 1100, style: 'aggressive', bio: 'Ruthless and impulsive. Will grab material and ask questions later.' },
  { id: 'domitian', name: 'Domitian', reign: '81–96', elo: 1200, style: 'defensive', bio: 'A paranoid autocrat who sees threats everywhere and misses the real ones.' },
  { id: 'tiberius', name: 'Tiberius', reign: '14–37', elo: 1300, style: 'defensive', bio: 'Gloomy and suspicious. Retreats to Capri, and to passive defense.' },
  { id: 'claudius', name: 'Claudius', reign: '41–54', elo: 1400, style: 'balanced', bio: 'Underestimated by everyone. Quietly competent.' },
  { id: 'vespasian', name: 'Vespasian', reign: '69–79', elo: 1500, style: 'balanced', bio: 'A practical soldier who restored order. Solid, few frills.' },
  { id: 'antoninus', name: 'Antoninus Pius', reign: '138–161', elo: 1650, style: 'defensive', bio: 'Twenty-three peaceful years. Calm, patient positional play.' },
  { id: 'hadrian', name: 'Hadrian', reign: '117–138', elo: 1800, style: 'defensive', bio: 'Built a wall across Britain. Very hard to break through.' },
  { id: 'trajan', name: 'Trajan', reign: '98–117', elo: 1950, style: 'aggressive', bio: 'Optimus Princeps. Took the empire to its greatest extent, always on the offense.' },
  { id: 'marcus', name: 'Marcus Aurelius', reign: '161–180', elo: 2100, style: 'balanced', bio: 'The philosopher-emperor. Calm, precise, rarely rattled.' },
  { id: 'augustus', name: 'Augustus', reign: '27 BC–AD 14', elo: 2300, style: 'balanced', bio: 'Found Rome a city of brick and left it marble. Ruthlessly accurate.' },
]

export const botById = (id: string) => EMPERORS.find((b) => b.id === id) ?? EMPERORS[7]
