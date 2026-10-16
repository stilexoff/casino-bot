const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');

// Base de données locale
const DB_FILE = './database.json';
let db = { users: {}, jackpot: 1000, bounties: {}, euromillions_tickets: {}, last_euro_draw: 0 };

if (fs.existsSync(DB_FILE)) {
  try { 
    const loadedData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (loadedData.users) db = { bounties: {}, euromillions_tickets: {}, ...loadedData };
    else db = { users: loadedData, jackpot: 1000, bounties: {}, euromillions_tickets: {}, last_euro_draw: 0 };
  } catch (e) { 
    db = { users: {}, jackpot: 1000, bounties: {}, euromillions_tickets: {}, last_euro_draw: 0 }; 
  }
}

function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
  if (!db.users[userId]) {
    db.users[userId] = {
      money: 500,
      job_id: 1,
      stars: 0,
      last_daily: 0,
      last_work: 0,
      last_claim: 0
    };
    saveDB();
  }
  return db.users[userId];
}

function addToJackpot(amount) {
  const tax = Math.floor(amount * 0.10);
  if (tax > 0) {
    db.jackpot = (db.jackpot || 1000) + tax;
    saveDB();
  }
}

// 💼 Métiers & Plafonds
const JOBS = [
  { id: 1, name: "Plongeur de Casino", cost: 0, starCost: 100, gainPerStar: 10, maxBet: 500 },
  { id: 2, name: "Valet de Parking", cost: 1000, starCost: 300, gainPerStar: 25, maxBet: 2500 },
  { id: 3, name: "Barman de Salon", cost: 3500, starCost: 800, gainPerStar: 60, maxBet: 10000 },
  { id: 4, name: "Croupier de Blackjack", cost: 10000, starCost: 2000, gainPerStar: 150, maxBet: 30000 },
  { id: 5, name: "Videur VIP", cost: 25000, starCost: 5000, gainPerStar: 350, maxBet: 100000 },
  { id: 6, name: "Chef de Salle", cost: 60000, starCost: 12000, gainPerStar: 800, maxBet: 300000 },
  { id: 7, name: "Manager du Casino", cost: 150000, starCost: 30000, gainPerStar: 1800, maxBet: 1000000 },
  { id: 8, name: "Investisseur Partenaire", cost: 400000, starCost: 80000, gainPerStar: 4500, maxBet: 3000000 },
  { id: 9, name: "Actionnaire Majoritaire", cost: 1000000, starCost: 200000, gainPerStar: 11000, maxBet: 10000000 },
  { id: 10, name: "Propriétaire du Casino", cost: 2500000, starCost: 500000, gainPerStar: 28000, maxBet: Infinity }
];

function parseBet(betInput, userMoney, maxBet) {
  let bet = 0;
  const inputStr = String(betInput).trim().toLowerCase();

  if (inputStr === 'all' || inputStr === 'max') {
    bet = userMoney;
  } else {
    bet = parseInt(inputStr, 10);
  }

  if (isNaN(bet) || bet <= 0) return { valid: false, reason: '❌ Montant de mise invalide.' };
  if (bet > userMoney) return { valid: false, reason: '❌ Solde insuffisant.' };
  if (bet > maxBet) bet = maxBet;

  return { valid: true, amount: bet };
}

function calculateBlackjackScore(hand) {
  let score = 0, aces = 0;
  for (let card of hand) {
    if (card === 11) { aces += 1; score += 11; }
    else score += card;
  }
  while (score > 21 && aces > 0) { score -= 10; aces -= 1; }
  return score;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log(`🎰 Casino Bot connecté en tant que ${client.user.tag}`);
  
  const commands = [
    { name: 'daily', description: 'Reçois un don aléatoire (jusqu\'à 300 pièces)' },
    { name: 'work', description: 'Travaille pour ton salaire immédiat' },
    { name: 'claim', description: 'Récolte tes revenus passifs' },
    { name: 'profile', description: 'Affiche ton solde, métier, étoiles' },
    { name: 'invest', description: 'Achète une étoile ou change de métier' },
    { name: 'jackpot', description: 'Consulte le montant actuel du Jackpot' },
    { name: 'leaderboard', description: 'TOP 10 des joueurs les plus riches' },
    { name: 'cash', description: 'Gratter un ticket CASH (Coût: 500 🪙 - 1 chance sur 3)' },
    {
      name: 'euromillions',
      description: 'Achète une grille EuroMillions pour 50 🪙 (Jackpot 1M !)',
      options: [
        { name: 'num1', type: 4, description: 'Chiffre 1 (1 à 20)', required: true },
        { name: 'num2', type: 4, description: 'Chiffre 2 (1 à 20)', required: true },
        { name: 'num3', type: 4, description: 'Chiffre 3 (1 à 20)', required: true },
        { name: 'etoile', type: 4, description: 'Étoile mystère (1 à 5)', required: true }
      ]
    },
    { name: 'pmu', description: 'Parier sur une course hippique à 5 chevaux', options: [
        { name: 'cheval', type: 4, description: 'Choisir le cheval (1 à 5)', required: true },
        { name: 'mise', type: 3, description: 'Montant de la mise ou "all"', required: true }
    ]},
    { name: 'bounty', description: 'Placer une prime', options: [
        { name: 'cible', type: 6, description: 'Le joueur ciblé', required: true },
        { name: 'montant', type: 4, description: 'Montant', required: true }
    ]},
    { name: 'addmoney', description: '[Admin] Gérer les fonds', options: [
        { name: 'utilisateur', type: 6, description: 'Joueur', required: true },
        { name: 'montant', type: 3, description: 'Ex: 500, -200, ou "all"', required: true }
    ]},
    { name: 'coinflip', description: 'Pile ou Face', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true },
        { name: 'choix', type: 3, description: 'pile ou face', required: true, choices: [{name: 'Pile', value: 'pile'}, {name: 'Face', value: 'face'}]}
    ]},
    { name: 'shifumi', description: 'Shifumi contre le bot', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true },
        { name: 'choix', type: 3, description: 'Choix', required: true, choices: [{name: 'Pierre', value: 'pierre'}, {name: 'Feuille', value: 'feuille'}, {name: 'Ciseaux', value: 'ciseaux'}]}
    ]},
    { name: 'duel', description: 'Défier un membre', options: [
        { name: 'adversaire', type: 6, description: 'Adversaire', required: true },
        { name: 'mise', type: 4, description: 'Mise', required: true }
    ]},
    { name: 'crash', description: 'Jeu du Crash', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true }
    ]},
    { name: 'roulette', description: 'Roulette de casino', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true },
        { name: 'type', type: 3, description: 'Type', required: true, choices: [
            { name: '🔴 Rouge (x2)', value: 'rouge' },
            { name: '⚫ Noir (x2)', value: 'noir' },
            { name: '⚖️ Pair (x2)', value: 'pair' },
            { name: '⚡ Impair (x2)', value: 'impair' },
            { name: '🟢 Vert / 0 (x35)', value: 'vert' },
            { name: '🎯 Numéro exact (x35)', value: 'numero' }
          ] 
        },
        { name: 'numero', type: 4, description: '0 à 36', required: false }
    ]},
    { name: 'blackjack', description: 'Blackjack', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true }
    ]}
  ];

  await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, options, user } = interaction;
  const userData = getUser(user.id);
  const now = Date.now();

  // 1. DAILY
  if (commandName === 'daily') {
    const cooldown = 24 * 60 * 60 * 1000;
    if (now - userData.last_daily < cooldown) {
      const hours = Math.ceil((cooldown - (now - userData.last_daily)) / (1000 * 60 * 60));
      return interaction.reply({ content: `⏳ Reviens dans **${hours}h** !`, ephemeral: true });
    }
    const gain = Math.floor(Math.random() * 300) + 1;
    userData.money += gain;
    userData.last_daily = now;
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 Don Quotidien').setDescription(`Tu as reçu **+${gain} 🪙** !`).setColor('#FFD700')] });
  }

  // 2. WORK
  if (commandName === 'work') {
    const cooldown = 2 * 60 * 60 * 1000;
    if (now - userData.last_work < cooldown) {
      const mins = Math.ceil((cooldown - (now - userData.last_work)) / (1000 * 60));
      return interaction.reply({ content: `⏳ Reviens dans **${mins} minutes**.`, ephemeral: true });
    }
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const gain = (currentJob.id * 40) + Math.floor(Math.random() * 20);
    userData.money += gain;
    userData.last_work = now;
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💼 Service : ${currentJob.name}`).setDescription(`Tu as gagné **+${gain} 🪙** !`).setColor('#2ECC71')] });
  }

  // 3. CLAIM
  if (commandName === 'claim') {
    const hours = Math.floor((now - userData.last_claim) / (1000 * 60 * 60));
    if (hours < 1) return interaction.reply({ content: `⏳ Laisse couler au moins 1 heure d'investissement.`, ephemeral: true });
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const hourlyGain = userData.stars * currentJob.gainPerStar;
    const totalGain = hourlyGain * hours;
    if (totalGain <= 0) return interaction.reply({ content: `❌ Aucune étoile investie.`, ephemeral: true });
    userData.money += totalGain;
    userData.last_claim = now;
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📈 Salaire Récolté').setDescription(`Tu as récupéré **+${totalGain.toLocaleString()} 🪙** !`).setColor('#1ABC9C')] });
  }

  // 4. PROFILE
  if (commandName === 'profile') {
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const starsStr = '⭐'.repeat(userData.stars) + '⚫'.repeat(5 - userData.stars);
    const passiveHour = userData.stars * currentJob.gainPerStar;
    const userBounty = db.bounties[user.id] || 0;
    const limitDisplay = currentJob.maxBet === Infinity ? 'Illimitée ♾️' : `${currentJob.maxBet.toLocaleString()} 🪙`;

    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle(`🎰 Fiche Joueur : ${user.username}`).addFields(
        { name: '💵 Solde', value: `**${userData.money.toLocaleString()} 🪙**`, inline: true },
        { name: '💼 Poste', value: `Niv.${currentJob.id} - **${currentJob.name}**`, inline: true },
        { name: '⭐ Investissements', value: `${starsStr} (${userData.stars}/5)` },
        { name: '📈 Revenu Passif', value: `**+${passiveHour.toLocaleString()} 🪙 / h**` },
        { name: '🚫 Limite de Mise', value: `**${limitDisplay}**`, inline: true },
        { name: '🎯 Prime', value: `**${userBounty.toLocaleString()} 🪙**`, inline: true }
      ).setColor('#9B59B6')
    ]});
  }

  // 5. INVEST
  if (commandName === 'invest') {
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    if (userData.stars < 5) {
      if (userData.money < currentJob.starCost) return interaction.reply({ content: `❌ Coût : **${currentJob.starCost} 🪙**.`, ephemeral: true });
      userData.money -= currentJob.starCost;
      userData.stars += 1;
      saveDB();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Étoile Débloquée !').setDescription(`Étoile **${userData.stars}/5** acquise !`).setColor('#F1C40F')] });
    } else {
      const nextJob = JOBS.find(j => j.id === userData.job_id + 1);
      if (!nextJob) return interaction.reply({ content: `👑 Tu es le Propriétaire ultime !`, ephemeral: true });
      if (userData.money < nextJob.cost) return interaction.reply({ content: `❌ Coût de promotion : **${nextJob.cost.toLocaleString()} 🪙**.`, ephemeral: true });
      userData.money -= nextJob.cost;
      userData.job_id += 1;
      userData.stars = 0;
      saveDB();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎉 PROMOTION ACCORDÉE !').setDescription(`Tu es promu : **${nextJob.name}** !`).setColor('#E91E63')] });
    }
  }

  // 🎫 6. JEU À GRATTER CASH (Proba 1/3)
  if (commandName === 'cash') {
    const TICKET_COST = 500;
    if (userData.money < TICKET_COST) return interaction.reply({ content: `❌ Un ticket CASH coûte **500 🪙**.`, ephemeral: true });

    userData.money -= TICKET_COST;
    addToJackpot(TICKET_COST);

    await interaction.deferReply();

    const isWinner = Math.random() < 0.333;
    let winAmount = 0;

    if (isWinner) {
      const rand = Math.random();
      if (rand < 0.60) winAmount = 750;
      else if (rand < 0.85) winAmount = 1500;
      else if (rand < 0.97) winAmount = 5000;
      else winAmount = 25000;

      userData.money += winAmount;
    }
    saveDB();

    const embedScratch = new EmbedBuilder()
      .setTitle('🎫 Grattage du Ticket CASH...')
      .setDescription('🪙 [ ❓ ]  [ ❓ ]  [ ❓ ] 🪙\n*Grattez vos numéros gagnants...*')
      .setColor('#F39C12');

    await interaction.editReply({ embeds: [embedScratch] });

    setTimeout(async () => {
      const finalEmbed = new EmbedBuilder()
        .setTitle(isWinner ? '🎉 TICKET CASH GAGNANT !' : '💥 TICKET PERDANT !')
        .setDescription(isWinner 
          ? `🪙 [ **${winAmount.toLocaleString()} 🪙** ]  [ 🌟 ]  [ **${winAmount.toLocaleString()} 🪙** ] 🪙\n\nFélicitations, tu remportes **+${winAmount.toLocaleString()} 🪙** !`
          : '🪙 [ 0 🪙 ]  [ ✖️ ]  [ 0 🪙 ] 🪙\n\nPas de chance, le ticket ne contenait aucun symbole gagnant.')
        .setColor(isWinner ? '#2ECC71' : '#E74C3C');

      await interaction.editReply({ embeds: [finalEmbed] });
    }, 2500);
  }

  // 🎰 7. BÉBÉ-EUROMILLIONS (50 COINS)
  if (commandName === 'euromillions') {
    const TICKET_COST = 50;
    if (userData.money < TICKET_COST) return interaction.reply({ content: `❌ Une grille coûte **50 🪙**.`, ephemeral: true });

    const n1 = options.getInteger('num1');
    const n2 = options.getInteger('num2');
    const n3 = options.getInteger('num3');
    const star = options.getInteger('etoile');

    if (n1 < 1 || n1 > 20 || n2 < 1 || n2 > 20 || n3 < 1 || n3 > 20) return interaction.reply({ content: '❌ Les 3 chiffres doivent être compris entre **1 et 20**.', ephemeral: true });
    if (star < 1 || star > 5) return interaction.reply({ content: '❌ L\'Étoile mystère doit être comprise entre **1 et 5**.', ephemeral: true });

    userData.money -= TICKET_COST;
    addToJackpot(TICKET_COST);

    if (!db.euromillions_tickets[user.id]) db.euromillions_tickets[user.id] = [];
    const playerNums = [n1, n2, n3].sort((a,b) => a-b);
    db.euromillions_tickets[user.id].push({ numbers: playerNums, star: star });
    saveDB();

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎟️ Grille EuroMillions Validée !')
        .setDescription(`Tes numéros : **${playerNums.join(' - ')}** | Étoile : **⭐ ${star}**\n\n*Prix : **50 🪙** | Jackpot de **1 000 000 🪙** en jeu !*`)
        .setColor('#3498DB')
    ]});
  }

  // 🏇 8. COURSE HIPPIQUE PMU (5 Chevaux)
  if (commandName === 'pmu') {
    const horseChoice = options.getInteger('cheval');
    const rawBet = options.getString('mise');
    const currentJob = JOBS.find(j => j.id === userData.job_id);

    if (horseChoice < 1 || horseChoice > 5) return interaction.reply({ content: '❌ Choisis un cheval entre 1 et 5.', ephemeral: true });

    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet);
    if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount;

    userData.money -= bet;
    saveDB();

    const horses = [
      { id: 1, name: "⚡ Éclair de Feu", pos: 0 },
      { id: 2, name: "🌪️ Tempête Noire", pos: 0 },
      { id: 3, name: "👑 Galop Impérial", pos: 0 },
      { id: 4, name: "🚀 Tornado", pos: 0 },
      { id: 5, name: "💎 Pégase d'Or", pos: 0 }
    ];

    await interaction.deferReply();

    const renderTrack = () => {
      let trackStr = "";
      for (let h of horses) {
        const line = "➖".repeat(h.pos) + "🏇" + "➖".repeat(10 - h.pos);
        trackStr += `N°${h.id} **${h.name}** : [${line}] 🏁\n`;
      }
      return trackStr;
    };

    let winner = null;
    for (let turn = 0; turn < 5; turn++) {
      for (let h of horses) {
        if (!winner) {
          h.pos += Math.floor(Math.random() * 3) + 1;
          if (h.pos >= 10) { h.pos = 10; if (!winner) winner = h; }
        }
      }

      await interaction.editReply({ embeds: [
        new EmbedBuilder().setTitle('🏇 COURSE PMU EN COURS !').setDescription(renderTrack()).setColor('#E67E22')
      ]});
      await new Promise(r => setTimeout(r, 1200));
      if (winner) break;
    }

    const won = winner.id === horseChoice;
    const gain = won ? bet * 4 : -bet;

    if (won) userData.money += (bet * 4);
    else addToJackpot(bet);
    saveDB();

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(won ? '🎉 VICTOIRE AU PMU !' : '💥 DÉFAITE AU PMU !')
        .setDescription(`${renderTrack()}\n\n🏆 Vainqueur : **${winner.name}** (N°${winner.id}) !\n${won ? `🎉 Tu remportes **+${gain.toLocaleString()} 🪙** (Cote x4) !` : `💥 Ton cheval n'a pas fini 1er. Tu perds **-${bet.toLocaleString()} 🪙**.`}`)
        .setColor(won ? '#2ECC71' : '#E74C3C')
    ]});
  }

  // 9. LEADERBOARD
  if (commandName === 'leaderboard') {
    const sorted = Object.entries(db.users).map(([id, data]) => ({ id, money: data.money })).sort((a, b) => b.money - a.money).slice(0, 10);
    let desc = ""; const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    for (let i = 0; i < sorted.length; i++) {
      const u = await client.users.fetch(sorted[i].id).catch(() => null);
      desc += `${medals[i]} **${u ? u.username : 'Inconnu'}** — ${sorted[i].money.toLocaleString()} 🪙\n`;
    }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 TOP 10 CASINO').setDescription(desc || 'Aucun joueur.').setColor('#FFD700')] });
  }

  // 10. BOUNTY
  if (commandName === 'bounty') {
    const target = options.getUser('cible'); const amount = options.getInteger('montant');
    if (target.id === user.id || target.bot || amount <= 0 || userData.money < amount) return interaction.reply({ content: '❌ Invalide.', ephemeral: true });
    userData.money -= amount; db.bounties[target.id] = (db.bounties[target.id] || 0) + amount; saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎯 PRIME AJOUTÉE !').setDescription(`+${amount.toLocaleString()} 🪙 sur ${target}.`).setColor('#E74C3C')] });
  }

  // 11. JACKPOT
  if (commandName === 'jackpot') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎰 JACKPOT').setDescription(`Cagnotte : **${(db.jackpot || 1000).toLocaleString()} 🪙**`).setColor('#FFD700')] });
  }

  // 12. ADMIN ADDMONEY
  if (commandName === 'addmoney') {
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin requis.', ephemeral: true });
    const targetUser = options.getUser('utilisateur'); const rawAmount = options.getString('montant').trim().toLowerCase();
    const targetData = getUser(targetUser.id);
    if (rawAmount === 'all' || rawAmount === 'max') { targetData.money = 0; } 
    else { const amount = parseInt(rawAmount, 10); if (isNaN(amount)) return interaction.reply({ content: '❌ Invalide.', ephemeral: true }); targetData.money += amount; if (targetData.money < 0) targetData.money = 0; }
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ [ADMIN] Solde Modifié').setDescription(`Nouveau solde de ${targetUser} : **${targetData.money.toLocaleString()} 🪙**`).setColor('#27AE60')] });
  }

  // ================= GAMBLING STANDARD =================

  // DUEL
  if (commandName === 'duel') {
    const target = options.getUser('adversaire'); const bet = options.getInteger('mise');
    if (target.id === user.id || target.bot || bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Invalide.', ephemeral: true });
    const targetData = getUser(target.id); if (targetData.money < bet) return interaction.reply({ content: '❌ Solde adversaire insuffisant.', ephemeral: true });
    const rowAccept = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('accept_duel').setLabel('✅ Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('refuse_duel').setLabel('❌ Refuser').setStyle(ButtonStyle.Danger));
    const resp = await interaction.reply({ content: `${target}`, embeds: [new EmbedBuilder().setTitle('⚔️ DUEL !').setDescription(`${user} défie ${target} pour **${bet.toLocaleString()} 🪙** !`)], components: [rowAccept], fetchReply: true });
    const collector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    collector.on('collect', async i => {
      if (i.user.id !== target.id) return;
      if (i.customId === 'accept_duel') {
        collector.stop(); userData.money -= bet; targetData.money -= bet; saveDB();
        let c1 = null, c2 = null;
        const rowC = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pierre').setLabel('🪨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('feuille').setLabel('🍃').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ciseaux').setLabel('✂️').setStyle(ButtonStyle.Primary));
        await i.update({ embeds: [new EmbedBuilder().setTitle('⚔️ DUEL EN COURS').setDescription('Choisissez en secret !')], components: [rowC] });
        const gColl = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
        gColl.on('collect', async btn => {
          if (btn.user.id === user.id) c1 = btn.customId; if (btn.user.id === target.id) c2 = btn.customId;
          await btn.reply({ content: 'Choix enregistré !', ephemeral: true });
          if (c1 && c2) {
            gColl.stop(); let winner = null, loser = null;
            if (c1 === c2) winner = 'draw';
            else if ((c1 === 'pierre' && c2 === 'ciseaux') || (c1 === 'feuille' && c2 === 'pierre') || (c1 === 'ciseaux' && c2 === 'feuille')) { winner = user; loser = target; }
            else { winner = target; loser = user; }
            if (winner === 'draw') { userData.money += bet; targetData.money += bet; saveDB(); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle('⚖️ ÉGALITÉ !')], components: [] }); }
            let totalGain = bet * 2; if (db.bounties[loser.id]) { totalGain += db.bounties[loser.id]; delete db.bounties[loser.id]; }
            getUser(winner.id).money += totalGain; saveDB();
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🏆 VICTOIRE DE ${winner.username} !`).setDescription(`Gain total : **+${totalGain.toLocaleString()} 🪙**`)], components: [] });
          }
        });
      }
    });
  }

  // CRASH
  if (commandName === 'crash') {
    const rawBet = options.getString('mise'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; userData.money -= bet; saveDB();
    const crashPoint = +(1 + Math.random() * Math.random() * 8).toFixed(2); let currentMultiplier = 1.00, cashedOut = false;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cashout').setLabel('💸 CASH OUT').setStyle(ButtonStyle.Success));
    const response = await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚀 CRASH').setDescription(`Multiplicateur : **x1.00**`)], components: [row], fetchReply: true });
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20000 });
    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }
      currentMultiplier += 0.20;
      if (currentMultiplier >= crashPoint) {
        clearInterval(interval); collector.stop(); addToJackpot(bet);
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💥 CRASH !').setDescription(`Crashé à x${crashPoint.toFixed(2)}. Perte: -${bet} 🪙`)], components: [] });
      } else { await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🚀 CRASH').setDescription(`Multiplicateur : **x${currentMultiplier.toFixed(2)}**`)] }).catch(() => {}); }
    }, 1200);
    collector.on('collect', async i => {
      if (i.user.id === user.id && !cashedOut) {
        cashedOut = true; clearInterval(interval); collector.stop();
        const win = Math.floor(bet * currentMultiplier); userData.money += win; saveDB();
        await i.update({ embeds: [new EmbedBuilder().setTitle('🎉 CASH OUT !').setDescription(`Gagné : **+${win.toLocaleString()} 🪙** (x${currentMultiplier.toFixed(2)})`)], components: [] });
      }
    });
  }

  // COINFLIP
  if (commandName === 'coinflip') {
    const rawBet = options.getString('mise'); const choice = options.getString('choix'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    setTimeout(async () => {
      const res = Math.random() < 0.5 ? 'pile' : 'face'; const won = res === choice;
      if (won) userData.money += bet; else { userData.money -= bet; addToJackpot(bet); } saveDB();
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(won ? '🎉 GAGNÉ !' : '💥 PERDU !').setDescription(`Résultat : **${res.toUpperCase()}** (${won ? `+${bet}` : `-${bet}`} 🪙)`)] });
    }, 2000);
  }

  // SHIFUMI
  if (commandName === 'shifumi') {
    const rawBet = options.getString('mise'); const choice = options.getString('choix'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    const botC = ['pierre', 'feuille', 'ciseaux'][Math.floor(Math.random() * 3)];
    let outcome = (choice === botC) ? 'draw' : ((choice === 'pierre' && botC === 'ciseaux') || (choice === 'feuille' && botC === 'pierre') || (choice === 'ciseaux' && botC === 'feuille')) ? 'win' : 'lose';
    if (outcome === 'win') userData.money += bet; else if (outcome === 'lose') { userData.money -= bet; addToJackpot(bet); } saveDB();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(outcome === 'win' ? '🎉 GAGNÉ !' : outcome === 'draw' ? '⚖️ ÉGALITÉ' : '💥 PERDU !').setDescription(`Toi: ${choice} vs Bot: ${botC}`)] });
  }

  // ROULETTE
  if (commandName === 'roulette') {
    const rawBet = options.getString('mise'); const type = options.getString('type'); const chosenNum = options.getInteger('numero'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    const winNum = Math.floor(Math.random() * 37); let winColor = (winNum === 0) ? 'vert' : ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winNum) ? 'rouge' : 'noir');
    let won = (type === winColor) || (type === 'pair' && winNum !== 0 && winNum % 2 === 0) || (type === 'impair' && winNum % 2 !== 0) || (type === 'numero' && winNum === chosenNum);
    let mult = (type === 'vert' || type === 'numero') ? 35 : 2;
    if (won) userData.money += (bet * mult) - bet; else { userData.money -= bet; addToJackpot(bet); } saveDB();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(won ? '🎰 VICTOIRE !' : '🎰 PERDU !').setDescription(`Chiffre gagnant : **${winNum}** (${winColor.toUpperCase()})\n${won ? `+${(bet * mult) - bet}` : `-${bet}`} 🪙`)] });
  }

  // BLACKJACK
  if (commandName === 'blackjack') {
    const rawBet = options.getString('mise'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; const deck = [2,3,4,5,6,7,8,9,10,10,10,10,11]; const draw = () => deck[Math.floor(Math.random() * deck.length)];
    let pHand = [draw(), draw()], dHand = [draw(), draw()];
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hit').setLabel('🃏 Tirer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('stand').setLabel('✋ Rester').setStyle(ButtonStyle.Success));
    const response = await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🃏 Blackjack').addFields({ name: 'Tes cartes', value: `${pHand.join(', ')} (${calculateBlackjackScore(pHand)})` })], components: [row], fetchReply: true });
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async i => {
      if (i.user.id !== user.id) return;
      if (i.customId === 'hit') {
        pHand.push(draw());
        if (calculateBlackjackScore(pHand) > 21) {
          userData.money -= bet; addToJackpot(bet); saveDB(); collector.stop();
          return i.update({ embeds: [new EmbedBuilder().setTitle('💥 BUST !').setDescription(`Total: ${calculateBlackjackScore(pHand)}. Perte: -${bet} 🪙`)], components: [] });
        }
        await i.update({ embeds: [new EmbedBuilder().setTitle('🃏 Blackjack').addFields({ name: 'Tes cartes', value: `${pHand.join(', ')} (${calculateBlackjackScore(pHand)})` })] });
      }
      if (i.customId === 'stand') {
        collector.stop(); while (calculateBlackjackScore(dHand) < 17) dHand.push(draw());
        const pS = calculateBlackjackScore(pHand), dS = calculateBlackjackScore(dHand);
        let win = (dS > 21 || pS > dS), drawG = (pS === dS);
        if (win) userData.money += bet; else if (!drawG) { userData.money -= bet; addToJackpot(bet); } saveDB();
        return i.update({ embeds: [new EmbedBuilder().setTitle(win ? '🎉 VICTOIRE !' : drawG ? '⚖️ ÉGALITÉ' : '💥 PERDU !').setDescription(`Toi: ${pS} vs Banque: ${dS}`)], components: [] });
      }
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
