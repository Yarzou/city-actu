#!/usr/bin/env node
/**
 * scripts/db-migrate.js
 * Pilote Liquibase pour la base de données Supabase/PostgreSQL.
 *
 * Usage :
 *   node scripts/db-migrate.js update          → applique toutes les migrations manquantes
 *   node scripts/db-migrate.js status          → liste l'état des changelogs
 *   node scripts/db-migrate.js rollback <tag>  → rollback jusqu'au tag donné
 *   node scripts/db-migrate.js tag <nom>       → pose un tag (point de rollback)
 *   node scripts/db-migrate.js validate        → valide les fichiers changelog
 */

const { Liquibase, LiquibaseConfig } = require('liquibase')
const path = require('path')

// Vérification de la variable de mot de passe
const dbPassword = 'uR3gbuJSp/8ed$z'
if (!dbPassword) {
  console.error('\n❌  Variable SUPABASE_DB_PASSWORD manquante.')
  console.error('    Ajoutez-la dans .env.local ou exportez-la dans votre shell :\n')
  console.error('    export SUPABASE_DB_PASSWORD="votre-mot-de-passe"\n')
  process.exit(1)
}
//6543
/** @type {LiquibaseConfig} */
const config = {
  url: 'jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres',
  username: 'postgres.giwpesnzwtcobfffpwnh',
  password: dbPassword,
  changeLogFile: 'liquibase/changelog/db.changelog-master.xml',
  liquibasePropertiesFile: path.resolve(__dirname, '../liquibase/liquibase.properties'),
  // Désactive la télémétrie Liquibase
}

const instance = new Liquibase(config)

const [,, command, ...args] = process.argv

const commands = {
  update:   () => instance.update({}),
  status:   () => instance.status({}),
  validate: () => instance.validate(),
  rollback: () => {
    const tag = args[0]
    if (!tag) { console.error('Usage: rollback <tag>'); process.exit(1) }
    return instance.rollback({ rollbackTag: tag })
  },
  tag: () => {
    const tag = args[0]
    if (!tag) { console.error('Usage: tag <nom>'); process.exit(1) }
    return instance.tag({ tag })
  },
}

if (!commands[command]) {
  console.error(`\n❌  Commande inconnue : "${command}"`)
  console.error('    Commandes disponibles : update | status | validate | rollback <tag> | tag <nom>\n')
  process.exit(1)
}

console.log(`\n🚀  Liquibase → ${command}\n`)

commands[command]()
  .then(() => console.log(`\n✅  ${command} terminé avec succès.\n`))
  .catch(err => {
    console.error(`\n❌  Erreur lors de "${command}" :`, err.message || err)
    process.exit(1)
  })
