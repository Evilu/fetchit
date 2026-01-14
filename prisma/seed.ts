import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.user.deleteMany();
  await prisma.group.deleteMany();

  // Create groups
  const groups = await Promise.all([
    prisma.group.create({ data: { name: 'Engineering', status: 'notEmpty' } }),
    prisma.group.create({ data: { name: 'Marketing', status: 'notEmpty' } }),
    prisma.group.create({ data: { name: 'Sales', status: 'notEmpty' } }),
    prisma.group.create({ data: { name: 'HR', status: 'empty' } }),
    prisma.group.create({ data: { name: 'Finance', status: 'notEmpty' } }),
  ]);

  // Create users
  await prisma.user.createMany({
    data: [
      { username: 'alice', status: 'active', groupId: groups[0].id },
      { username: 'bob', status: 'active', groupId: groups[0].id },
      { username: 'charlie', status: 'pending', groupId: groups[0].id },
      { username: 'david', status: 'active', groupId: groups[1].id },
      { username: 'eve', status: 'blocked', groupId: groups[1].id },
      { username: 'frank', status: 'active', groupId: groups[2].id },
      { username: 'grace', status: 'pending', groupId: groups[2].id },
      { username: 'henry', status: 'active', groupId: groups[2].id },
      { username: 'ivy', status: 'active', groupId: groups[4].id },
      { username: 'jack', status: 'pending', groupId: null },
      { username: 'karen', status: 'active', groupId: null },
      { username: 'leo', status: 'blocked', groupId: null },
    ],
  });

  console.log('Seed completed: 5 groups, 12 users');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
