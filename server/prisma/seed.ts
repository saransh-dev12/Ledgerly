import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/auth.js';

const prisma = new PrismaClient();

const EMAIL = 'demo@ledgerly.app';
const PASSWORD = 'ledgerly123';

const CATEGORIES = [
  { name: 'Food & dining', kind: 'expense' },
  { name: 'Housing', kind: 'expense' },
  { name: 'Transport', kind: 'expense' },
  { name: 'Shopping', kind: 'expense' },
  { name: 'Health', kind: 'expense' },
  { name: 'Subscriptions', kind: 'expense' },
  { name: 'Travel', kind: 'expense' },
  { name: 'Other', kind: 'expense' },
  { name: 'Income', kind: 'income' },
];

// A believable six months of life for someone who gets paid monthly.
const HISTORY: { monthsAgo: number; day: number; kind: 'income' | 'expense'; amount: number; note: string; category: string }[] = [
  { monthsAgo: 5, day: 1, kind: 'income', amount: 92000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 5, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 5, day: 5, kind: 'expense', amount: 4200, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 5, day: 8, kind: 'expense', amount: 650, note: 'Metro card top-up', category: 'Transport' },
  { monthsAgo: 5, day: 11, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 5, day: 16, kind: 'expense', amount: 2350, note: 'Dinner with Priya', category: 'Food & dining' },
  { monthsAgo: 5, day: 21, kind: 'expense', amount: 8600, note: 'Running shoes', category: 'Shopping' },

  { monthsAgo: 4, day: 1, kind: 'income', amount: 92000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 4, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 4, day: 6, kind: 'expense', amount: 5100, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 4, day: 9, kind: 'expense', amount: 980, note: 'Ride share', category: 'Transport' },
  { monthsAgo: 4, day: 11, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 4, day: 14, kind: 'expense', amount: 1200, note: 'Pharmacy', category: 'Health' },
  { monthsAgo: 4, day: 24, kind: 'expense', amount: 3200, note: 'Flight to Bengaluru', category: 'Travel' },

  { monthsAgo: 3, day: 1, kind: 'income', amount: 96000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 3, day: 1, kind: 'income', amount: 14000, note: 'Freelance — landing page', category: 'Income' },
  { monthsAgo: 3, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 3, day: 7, kind: 'expense', amount: 4600, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 3, day: 12, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 3, day: 19, kind: 'expense', amount: 6900, note: 'Weekend trip — Goa', category: 'Travel' },
  { monthsAgo: 3, day: 27, kind: 'expense', amount: 2400, note: 'Dinner with the team', category: 'Food & dining' },

  { monthsAgo: 2, day: 1, kind: 'income', amount: 96000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 2, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 2, day: 4, kind: 'expense', amount: 4300, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 2, day: 11, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 2, day: 13, kind: 'expense', amount: 780, note: 'Metro card top-up', category: 'Transport' },
  { monthsAgo: 2, day: 22, kind: 'expense', amount: 5200, note: 'New monitor', category: 'Shopping' },

  { monthsAgo: 1, day: 1, kind: 'income', amount: 96000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 1, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 1, day: 8, kind: 'expense', amount: 4900, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 1, day: 11, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 1, day: 15, kind: 'expense', amount: 1650, note: 'Dentist', category: 'Health' },
  { monthsAgo: 1, day: 26, kind: 'expense', amount: 3100, note: 'Groceries + household', category: 'Food & dining' },

  { monthsAgo: 0, day: 1, kind: 'income', amount: 96000, note: 'Salary — Northwind Studio', category: 'Income' },
  { monthsAgo: 0, day: 2, kind: 'expense', amount: 28500, note: 'Apartment rent', category: 'Housing' },
  { monthsAgo: 0, day: 5, kind: 'expense', amount: 3850, note: 'Groceries — weekly', category: 'Food & dining' },
  { monthsAgo: 0, day: 9, kind: 'expense', amount: 1499, note: 'Streaming bundle', category: 'Subscriptions' },
  { monthsAgo: 0, day: 12, kind: 'expense', amount: 640, note: 'Auto to airport', category: 'Transport' },
  { monthsAgo: 0, day: 17, kind: 'expense', amount: 2200, note: 'Dinner with friends', category: 'Food & dining' },
  { monthsAgo: 0, day: 20, kind: 'expense', amount: 1100, note: 'Gift for Mum', category: 'Shopping' },
];

function monthDate(monthsAgo: number, day: number) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28), 12, 0, 0);
  return d;
}

async function main() {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) {
    console.log('Creating demo user...');
    await prisma.user.create({
      data: {
        email: EMAIL, passwordHash, displayName: 'Demo workspace', homeCurrency: 'INR', locale: 'en-IN',
        accounts: { create: [
          { name: 'Cash', type: 'cash', currency: 'INR', openingMinor: 1200000 },
          { name: 'HDFC Salary', type: 'bank', currency: 'INR', openingMinor: 4500000 },
          { name: 'Revolut USD', type: 'wallet', currency: 'USD', openingMinor: 25000 },
        ]},
        categories: { create: CATEGORIES },
      },
    });
  } else {
    console.log('Resetting demo data...');
    await prisma.transactionLink.deleteMany({ where: { from: { userId: user.id } } });
    await prisma.recoveryCode.deleteMany({ where: { userId: user.id } });
    await prisma.transaction.deleteMany({ where: { userId: user.id } });
    await prisma.budget.deleteMany({ where: { userId: user.id } });
    await prisma.savingsGoal.deleteMany({ where: { userId: user.id } });
    await prisma.recurringRule.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.category.deleteMany({ where: { userId: user.id } });
    await prisma.account.createMany({ data: [
      { userId: user.id, name: 'Cash', type: 'cash', currency: 'INR', openingMinor: 1200000 },
      { userId: user.id, name: 'HDFC Salary', type: 'bank', currency: 'INR', openingMinor: 4500000 },
      { userId: user.id, name: 'Revolut USD', type: 'wallet', currency: 'USD', openingMinor: 25000 },
    ]});
    await prisma.category.createMany({ data: CATEGORIES.map(c => ({ ...c, userId: user.id })) });
  }

  const fresh = await prisma.user.findUnique({ where: { email: EMAIL }, include: { accounts: true } });
  const inr = fresh!.accounts.find(a => a.currency === 'INR')!;

  const rows = HISTORY.map(h => {
    const amountMinor = BigInt(Math.round(h.amount * 100));
    return {
      userId: fresh!.id, accountId: inr.id, kind: h.kind,
      amountMinor: h.kind === 'income' ? amountMinor : -amountMinor,
      currency: 'INR', note: h.note, category: h.category,
      bookedAt: monthDate(h.monthsAgo, h.day), rateToHome: 1,
    };
  });
  await prisma.transaction.createMany({ data: rows });
  console.log(`Seeded ${rows.length} transactions across 6 months.`);

  const month = new Date().toISOString().slice(0, 7);
  await prisma.budget.createMany({ data: [
    { userId: fresh!.id, category: 'Food & dining', limitMinor: 1200000, currency: 'INR', yearMonth: month },
    { userId: fresh!.id, category: 'Transport', limitMinor: 300000, currency: 'INR', yearMonth: month },
    { userId: fresh!.id, category: 'Shopping', limitMinor: 800000, currency: 'INR', yearMonth: month },
    { userId: fresh!.id, category: 'Subscriptions', limitMinor: 250000, currency: 'INR', yearMonth: month },
  ]});
  const goal = await prisma.savingsGoal.create({ data: {
    userId: fresh!.id, title: 'Emergency fund', targetMinor: 6000000, savedMinor: 0, currency: 'INR',
    deadline: new Date(Date.now() + 200 * 86400000),
  }});
  await prisma.savingsGoal.update({ where: { id: goal.id }, data: { savedMinor: 2400000 } });
  await prisma.savingsGoal.create({ data: {
    userId: fresh!.id, title: 'Japan trip', targetMinor: 4500000, savedMinor: 900000, currency: 'INR',
  }});
  await prisma.recurringRule.createMany({ data: [
    { userId: fresh!.id, title: 'Apartment rent', kind: 'expense', amountMinor: 2850000, currency: 'INR', category: 'Housing', frequency: 'monthly', nextRun: new Date(Date.now() + 12 * 86400000) },
    { userId: fresh!.id, title: 'Salary', kind: 'income', amountMinor: 9600000, currency: 'INR', category: 'Income', frequency: 'monthly', nextRun: new Date(Date.now() + 9 * 86400000) },
    { userId: fresh!.id, title: 'Streaming bundle', kind: 'expense', amountMinor: 149900, currency: 'INR', category: 'Subscriptions', frequency: 'monthly', nextRun: new Date(Date.now() + 5 * 86400000) },
  ]});
  console.log('Budgets, goals and recurring rules seeded.');
}

main().finally(() => prisma.$disconnect());
