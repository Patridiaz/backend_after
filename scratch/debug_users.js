
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.usuarioLocal.findMany({
    include: {
      talleres: {
        include: {
          taller: true
        }
      }
    }
  });

  console.log('--- USUARIOS Y SUS TALLERES ---');
  users.forEach(u => {
    console.log(`User: ${u.nombre} (${u.email}) - Rol: ${u.rol}`);
    console.log(`Talleres count: ${u.talleres.length}`);
    u.talleres.forEach(pt => {
      console.log(`  - Taller: ${pt.taller.nombre} (ID: ${pt.taller.id})`);
    });
    console.log('---------------------------');
  });

  const duplicates = await prisma.$queryRaw`
    SELECT email, COUNT(*) as count 
    FROM UsuarioLocal 
    GROUP BY email 
    HAVING COUNT(*) > 1
  `;
  console.log('Duplicate emails:', duplicates);

  const duplicatesExt = await prisma.$queryRaw`
    SELECT externalId, COUNT(*) as count 
    FROM UsuarioLocal 
    WHERE externalId IS NOT NULL
    GROUP BY externalId 
    HAVING COUNT(*) > 1
  `;
  console.log('Duplicate externalIds:', duplicatesExt);
}

checkUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
