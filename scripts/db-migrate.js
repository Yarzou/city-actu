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
const fs = require('fs')

// Charge .env.local (gitignoré) sans dépendance externe — les secrets ne doivent
// jamais vivre dans ce fichier, qui est suivi par git.
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, '../.env.local')
  if (!fs.existsSync(envPath)) return
  // split sur /\r?\n/ : en CRLF, le \r résiduel est un terminateur de ligne que `.` ne matche pas
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith('#')) continue
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i)
    if (!match) continue
    const [, key, rawValue] = match
    if (process.env[key]) continue
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '')
  }
}
loadEnvLocal()

const dbPassword = process.env.SUPABASE_DB_PASSWORD ?? process.env.DB_PASSWORD
if (!dbPassword) {
  console.error('\n❌  Mot de passe de la base manquant.')
  console.error('    Ajoutez DB_PASSWORD (ou SUPABASE_DB_PASSWORD) dans .env.local :\n')
  console.error('    DB_PASSWORD="votre-mot-de-passe"\n')
  process.exit(1)
}

// Port 6543 (transaction pooler) en repli si le 5432 est filtré par un pare-feu
const dbUrl = process.env.SUPABASE_DB_URL
  ?? 'jdbc:postgresql://aws-1-eu-central-1.pooler.supabase.com:5432/postgres'

/** @type {LiquibaseConfig} */
const config = {
  url: dbUrl,
  username: process.env.SUPABASE_DB_USER ?? 'postgres.giwpesnzwtcobfffpwnh',
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
    // Liquibase réaffiche la commande complète (mot de passe inclus) dans ses erreurs
    const message = String(err.message || err).split(dbPassword).join('******')
    console.error(`\n❌  Erreur lors de "${command}" :`, message)
    process.exit(1)
  })
