const { PrismaClient, TcgGameStatus } = require('@prisma/client');

const prisma = new PrismaClient();

const POKEMON_CARD_BACK =
  'https://www.bsastore.it/cdn/shop/collections/carta-pokeomon-back.png';

async function main() {
  await prisma.tcgGame.upsert({
    where: { code: 'pokemon' },
    update: {
      icon: POKEMON_CARD_BACK,
    },
    create: {
      code: 'pokemon',
      name: 'Pokémon',
      icon: POKEMON_CARD_BACK,
      status: TcgGameStatus.ACTIVE,
    },
  });

  await prisma.tcgGame.upsert({
    where: { code: 'yugioh' },
    update: {},
    create: {
      code: 'yugioh',
      name: 'Yu-Gi-Oh!',
      icon: '🐉',
      status: TcgGameStatus.COMING_SOON,
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
