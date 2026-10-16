const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');

// Base de données locale
const DB_FILE = './database.json';
let db = { users: {}, jackpot: 1000, bounties: {}, euromillions_tickets: {}, pmu_room: null };

if (fs.existsSync(DB_FILE)) {
  try { 
    const loadedData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (loadedData.users) db = { bounties: {}, euromillions_tickets: {}, ...loadedData };
    else db = { users: loadedData, jackpot: 1000, bounties: {}, euromillions_tickets: {}, pmu_room: null };
  } catch (e) { 
    db = { users: {}, jackpot: 1000, bounties: {}, euromillions_tickets: {}, pmu_room: null }; 
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
    { name: 'daily', description: '💳 [CARRIÈRE] Reçois ton don quotidien (jusqu\'à 300 pièces)' },
    { name: 'work', description: '💳 [CARRIÈRE] Travaille pour ton salaire immédiat' },
    { name: 'claim', description: '💳 [CARRIÈRE] Récolte tes revenus passifs' },
    { 
      name: 'profile', 
      description: '💳 [CARRIÈRE] Consule ton profil ou celui d\'un autre joueur',
      options: [
        { name: 'utilisateur', type: 6, description: 'Le membre dont tu veux voir la fiche (optionnel)', required: false }
      ]
    },
    { name: 'invest', description: '💳 [CARRIÈRE] Achète une étoile ou change de métier' },
    { name: 'jackpot', description: '🏆 [BANQUE] Consulte le montant actuel du Jackpot' },
    { name: 'leaderboard', description: '🏆 [BANQUE] TOP 10 des joueurs les plus riches' },
    { name: 'cash', description: '🎫 [LOTO] Ticket à gratter CASH interactif FDJ (Coût: 500 🪙)' },
    {
      name: 'euromillions',
      description: '🎫 [LOTO] Achète une grille EuroMillions pour 50 🪙 (Jackpot 1M !)',
      options: [
        { name: 'num1', type: 4, description: 'Chiffre 1 (1 à 20)', required: true },
        { name: 'num2', type: 4, description: 'Chiffre 2 (1 à 20)', required: true },
        { name: 'num3', type: 4, description: 'Chiffre 3 (1 à 20)', required: true },
        { name: 'etoile', type: 4, description: 'Étoile mystère (1 à 5)', required: true }
      ]
    },
    { name: 'pmu', description: '🏇 [ARÈNE] Course hippique coopérative à 5 joueurs' },
    { name: 'bounty', description: '⚔️ [ARÈNE] Placer une prime sur un joueur', options: [
        { name: 'cible', type: 6, description: 'Le joueur ciblé', required: true },
        { name: 'montant', type: 4, description: 'Montant', required: true }
    ]},
    { name: 'addmoney', description: '⚙️ [ADMIN] Gérer les fonds d\'un joueur', options: [
        { name: 'utilisateur', type: 6, description: 'Joueur', required: true },
        { name: 'montant', type: 3, description: 'Ex: 500, -200, ou "all"', required: true }
    ]},
    { name: 'setjob', description: '⚙️ [ADMIN] Modifier le métier et les étoiles d\'un joueur', options: [
        { name: 'utilisateur', type: 6, description: 'Joueur', required: true },
        { name: 'metier_niveau', type: 4, description: 'Niveau du métier (1 à 10)', required: true },
        { name: 'etoiles', type: 4, description: 'Nombre d\'étoiles (0 à 5)', required: false }
    ]},
    { name: 'coinflip', description: '🎲 [CASINO] Pile ou Face', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true },
        { name: 'choix', type: 3, description: 'pile ou face', required: true, choices: [{name: 'Pile', value: 'pile'}, {name: 'Face', value: 'face'}]}
    ]},
    { name: 'shifumi', description: '🎲 [CASINO] Shifumi contre le bot', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true },
        { name: 'choix', type: 3, description: 'Choix', required: true, choices: [{name: 'Pierre', value: 'pierre'}, {name: 'Feuille', value: 'feuille'}, {name: 'Ciseaux', value: 'ciseaux'}]}
    ]},
    { name: 'duel', description: '⚔️ [ARÈNE] Défier un membre en duel Shifumi', options: [
        { name: 'adversaire', type: 6, description: 'Adversaire', required: true },
        { name: 'mise', type: 4, description: 'Mise', required: true }
    ]},
    { name: 'crash', description: '🚀 [CASINO] Jeu du Crash', options: [
        { name: 'mise', type: 3, description: 'Montant ou "all"', required: true }
    ]},
    { name: 'roulette', description: '🎲 [CASINO] Roulette de casino', options: [
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
    { name: 'blackjack', description: '🎲 [CASINO] Blackjack contre le croupier', options: [
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

  // 💳 CARRIÈRE & FINANCES
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
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎁 DON QUOTIDIEN').setDescription(`Tu as reçu **+${gain} 🪙** pièces du Casino !`).setColor('#FFD700')] });
  }

  if (commandName === 'work') {
    const cooldown = 2 * 60 * 60 * 1000;
    if (now - userData.last_work < cooldown) {
      const mins = Math.ceil((cooldown - (now - userData.last_work)) / (1000 * 60));
      return interaction.reply({ content: `⏳ Repose-toi ! Reviens travailler dans **${mins} minutes**.`, ephemeral: true });
    }
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const gain = (currentJob.id * 40) + Math.floor(Math.random() * 20);
    userData.money += gain;
    userData.last_work = now;
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`💼 SERVICE : ${currentJob.name.toUpperCase()}`).setDescription(`Tu as terminé ton quart et gagné **+${gain} 🪙** !`).setColor('#2ECC71')] });
  }

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
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📈 REVENUS PASSIFS RÉCOLTÉS').setDescription(`Tu as récupéré **+${totalGain.toLocaleString()} 🪙** sur tes investissements !`).setColor('#1ABC9C')] });
  }

  // 🔍 PROFILE (Voir son propre profil ou celui de n'importe quel joueur)
  if (commandName === 'profile') {
    const targetUser = options.getUser('utilisateur') || user;
    const targetData = getUser(targetUser.id);
    
    const currentJob = JOBS.find(j => j.id === targetData.job_id);
    const starsStr = '⭐'.repeat(targetData.stars) + '⚫'.repeat(5 - targetData.stars);
    const passiveHour = targetData.stars * currentJob.gainPerStar;
    const userBounty = db.bounties[targetUser.id] || 0;
    const limitDisplay = currentJob.maxBet === Infinity ? 'Illimitée ♾️' : `${currentJob.maxBet.toLocaleString()} 🪙`;

    const isSelf = targetUser.id === user.id;

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle(`🎰 FICHE DU JOUEUR : ${targetUser.username.toUpperCase()}`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '💵 Solde Actuel', value: `**${targetData.money.toLocaleString()} 🪙**`, inline: true },
          { name: '💼 Poste de Carrière', value: `Niv.${currentJob.id} - **${currentJob.name}**`, inline: true },
          { name: '⭐ Investissements Job', value: `${starsStr} (${targetData.stars}/5)` },
          { name: '📈 Revenu Passif Horaire', value: `**+${passiveHour.toLocaleString()} 🪙 / heure**` },
          { name: '🚫 Limite de Mise par Jeu', value: `**${limitDisplay}**`, inline: true },
          { name: '🎯 Prime sur sa tête', value: `**${userBounty.toLocaleString()} 🪙**`, inline: true }
        )
        .setFooter({ text: isSelf ? 'Consulation de ta propre fiche' : `Fiche consultée par ${user.username}` })
        .setColor('#9B59B6')
    ]});
  }

  if (commandName === 'invest') {
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    if (userData.stars < 5) {
      if (userData.money < currentJob.starCost) return interaction.reply({ content: `❌ Coût d'étoile : **${currentJob.starCost} 🪙**. Solde insuffisant.`, ephemeral: true });
      userData.money -= currentJob.starCost;
      userData.stars += 1;
      saveDB();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ ÉTOILE DÉBLOQUÉE !').setDescription(`Étoile **${userData.stars}/5** acquise pour le poste **${currentJob.name}** !`).setColor('#F1C40F')] });
    } else {
      const nextJob = JOBS.find(j => j.id === userData.job_id + 1);
      if (!nextJob) return interaction.reply({ content: `👑 Tu es le Propriétaire ultime du Casino !`, ephemeral: true });
      if (userData.money < nextJob.cost) return interaction.reply({ content: `❌ Coût de promotion : **${nextJob.cost.toLocaleString()} 🪙**.`, ephemeral: true });
      userData.money -= nextJob.cost;
      userData.job_id += 1;
      userData.stars = 0;
      saveDB();
      return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎉 PROMOTION ACCORDÉE !').setDescription(`Félicitations, tu es promu au poste de : **${nextJob.name}** !`).setColor('#E91E63')] });
    }
  }

  // 🎫 LOTO & SCRATCH
  if (commandName === 'cash') {
    const TICKET_COST = 500;
    if (userData.money < TICKET_COST) return interaction.reply({ content: `❌ Un ticket CASH coûte **500 🪙**.`, ephemeral: true });

    userData.money -= TICKET_COST;
    addToJackpot(TICKET_COST);
    saveDB();

    const winningNums = [];
    while (winningNums.length < 4) {
      const r = Math.floor(Math.random() * 50) + 1;
      if (!winningNums.includes(r)) winningNums.push(r);
    }

    const isWinnerGlobal = Math.random() < 0.333;
    const playerNumbers = [];
    const prizeList = [500, 1000, 2000, 5000, 10000, 25000];

    for (let i = 0; i < 20; i++) {
      let num = Math.floor(Math.random() * 50) + 1;
      if (!isWinnerGlobal && winningNums.includes(num)) {
        num = (num + 5) % 50 + 1;
      }
      const prize = prizeList[Math.floor(Math.random() * prizeList.length)];
      playerNumbers.push({ num, prize, revealed: false });
    }

    if (isWinnerGlobal) {
      const matchIndex = Math.floor(Math.random() * 20);
      playerNumbers[matchIndex].num = winningNums[Math.floor(Math.random() * winningNums.length)];
    }

    let totalWon = 0;

    const rowAction = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('reveal_all').setLabel('✨ TOUT GRATTER').setStyle(ButtonStyle.Success)
    );

    const getCashEmbed = (finished = false) => {
      let desc = `🎯 **NUMÉROS GAGNANTS :** [ ${winningNums.map(n => `**${n}**`).join(' - ')} ]\n\n**VOS NUMÉROS :**\n`;
      
      for (let i = 0; i < 20; i++) {
        const item = playerNumbers[i];
        if (item.revealed || finished) {
          const isMatch = winningNums.includes(item.num);
          if (isMatch) {
            desc += `🟢 **[ ${item.num} ]** (${item.prize} 🪙)  `;
          } else {
            desc += `⚪ [ ${item.num} ]  `;
          }
        } else {
          desc += `🪙 [ ❓ ]  `;
        }
        if ((i + 1) % 4 === 0) desc += '\n';
      }

      if (finished) {
        desc += `\n\n${totalWon > 0 ? `🎉 **TICKET GAGNANT !** Tu remportes **+${totalWon.toLocaleString()} 🪙** !` : '💥 **TICKET PERDANT !** Aucun numéro ne correspond.'}`;
      }

      return new EmbedBuilder()
        .setTitle('🎫 TICKET CASH - FDJ')
        .setDescription(desc)
        .setColor(finished ? (totalWon > 0 ? '#2ECC71' : '#E74C3C') : '#F39C12');
    };

    const resp = await interaction.reply({ embeds: [getCashEmbed()], components: [rowAction], fetchReply: true });
    const collector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async i => {
      if (i.user.id !== user.id) return i.reply({ content: 'Pas ton ticket !', ephemeral: true });

      if (i.customId === 'reveal_all') {
        collector.stop();
        totalWon = 0;

        for (let item of playerNumbers) {
          item.revealed = true;
          if (winningNums.includes(item.num)) {
            totalWon += item.prize;
          }
        }

        if (totalWon > 0) {
          userData.money += totalWon;
          saveDB();
        }

        await i.update({ embeds: [getCashEmbed(true)], components: [] });
      }
    });
  }

  if (commandName === 'euromillions') {
    const TICKET_COST = 50;
    if (userData.money < TICKET_COST) return interaction.reply({ content: `❌ Une grille coûte **50 🪙**.`, ephemeral: true });

    const n1 = options.getInteger('num1');
    const n2 = options.getInteger('num2');
    const n3 = options.getInteger('num3');
    const star = options.getInteger('etoile');

    if (n1 < 1 || n1 > 20 || n2 < 1 || n2 > 20 || n3 < 1 || n3 > 20) return interaction.reply({ content: '❌ Les 3 chiffres doivent être entre **1 et 20**.', ephemeral: true });
    if (star < 1 || star > 5) return interaction.reply({ content: '❌ L\'Étoile mystère doit être entre **1 et 5**.', ephemeral: true });

    userData.money -= TICKET_COST;
    addToJackpot(TICKET_COST);

    if (!db.euromillions_tickets[user.id]) db.euromillions_tickets[user.id] = [];
    const playerNums = [n1, n2, n3].sort((a,b) => a-b);
    db.euromillions_tickets[user.id].push({ numbers: playerNums, star: star });
    saveDB();

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎟️ GRILLE EUROMILLIONS VALIDÉE')
        .setDescription(`Tes numéros : **${playerNums.join(' - ')}** | Étoile : **⭐ ${star}**\n\n*Prix : **50 🪙** | Jackpot de **1 000 000 🪙** en jeu !*`)
        .setColor('#3498DB')
    ]});
  }

  // 🏇 PMU MULTIJOUEURS
  if (commandName === 'pmu') {
    const BET_PMU = 1000;

    if (!db.pmu_room) {
      db.pmu_room = {
        bets: {},
        status: 'waiting'
      };
    }

    if (db.pmu_room.status === 'running') {
      return interaction.reply({ content: '❌ Une course PMU est déjà en cours !', ephemeral: true });
    }

    const horses = [
      { id: 1, name: "⚡ Éclair de Feu" },
      { id: 2, name: "🌪️ Tempête Noire" },
      { id: 3, name: "👑 Galop Impérial" },
      { id: 4, name: "🚀 Tornado" },
      { id: 5, name: "💎 Pégase d'Or" }
    ];

    const getPmuEmbed = () => {
      let desc = `**MISE FIXE PAR JOUEUR : ${BET_PMU.toLocaleString()} 🪙**\n\n*Chaque cheval ne peut être choisi que par un seul membre !*\n\n`;
      for (let h of horses) {
        const betInfo = db.pmu_room.bets[h.id];
        desc += `Cheval N°${h.id} **${h.name}** : ${betInfo ? `👤 **${betInfo.username}**` : '*[ Libre ]*'}\n`;
      }
      const totalBets = Object.keys(db.pmu_room.bets).length;
      desc += `\n**Joueurs inscrits : ${totalBets}/5**`;
      return new EmbedBuilder().setTitle('🏇 SESSION DE COURSE PMU (5 JOUEURS)').setDescription(desc).setColor('#F39C12');
    };

    const rowButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pmu_h1').setLabel('Cheval 1').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pmu_h2').setLabel('Cheval 2').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pmu_h3').setLabel('Cheval 3').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pmu_h4').setLabel('Cheval 4').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pmu_h5').setLabel('Cheval 5').setStyle(ButtonStyle.Primary)
    );

    const resp = await interaction.reply({ embeds: [getPmuEmbed()], components: [rowButtons], fetchReply: true });
    const collector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async btn => {
      const horseId = parseInt(btn.customId.replace('pmu_h', ''), 10);
      const player = btn.user;
      const pData = getUser(player.id);

      if (pData.money < BET_PMU) {
        return btn.reply({ content: `❌ Tu n'as pas assez de pièces (${BET_PMU} 🪙 requis).`, ephemeral: true });
      }

      const alreadyBet = Object.values(db.pmu_room.bets).find(b => b.userId === player.id);
      if (alreadyBet) {
        return btn.reply({ content: '❌ Tu as déjà misé sur un cheval dans cette course !', ephemeral: true });
      }

      if (db.pmu_room.bets[horseId]) {
        return btn.reply({ content: '❌ Ce cheval est déjà réservé par un autre joueur !', ephemeral: true });
      }

      pData.money -= BET_PMU;
      db.pmu_room.bets[horseId] = { userId: player.id, username: player.username };
      saveDB();

      await btn.reply({ content: `✅ Tu as parié sur le Cheval N°${horseId} !`, ephemeral: true });
      await interaction.editReply({ embeds: [getPmuEmbed()] });

      if (Object.keys(db.pmu_room.bets).length === 5) {
        collector.stop('full');
        db.pmu_room.status = 'running';

        const trackHorses = horses.map(h => ({ ...h, pos: 0 }));

        const renderTrack = () => {
          let str = "";
          for (let h of trackHorses) {
            const line = "➖".repeat(h.pos) + "🏇" + "➖".repeat(10 - h.pos);
            const betUser = db.pmu_room.bets[h.id];
            str += `N°${h.id} **${h.name}** (${betUser ? betUser.username : 'Bot'}) : [${line}] 🏁\n`;
          }
          return str;
        };

        let winner = null;
        for (let turn = 0; turn < 6; turn++) {
          for (let h of trackHorses) {
            if (!winner) {
              h.pos += Math.floor(Math.random() * 3) + 1;
              if (h.pos >= 10) { h.pos = 10; if (!winner) winner = h; }
            }
          }

          await interaction.editReply({ embeds: [
            new EmbedBuilder().setTitle('🏇 COURSE PMU EN DIRECT !').setDescription(renderTrack()).setColor('#E67E22')
          ], components: [] });
          await new Promise(r => setTimeout(r, 1200));
          if (winner) break;
        }

        const winningBet = db.pmu_room.bets[winner.id];
        const totalPot = BET_PMU * 5;

        if (winningBet) {
          const winnerData = getUser(winningBet.userId);
          winnerData.money += totalPot;
        } else {
          addToJackpot(totalPot);
        }

        db.pmu_room = null;
        saveDB();

        await interaction.editReply({ embeds: [
          new EmbedBuilder()
            .setTitle('🏆 VICTOIRE À LA COURSE PMU !')
            .setDescription(`${renderTrack()}\n\n🎉 Le Cheval N°${winner.id} (**${winner.name}**) gagne la course !\n\n` +
              `${winningBet ? `👑 Félicitations à **${winningBet.username}** qui remporte la cagnotte de **+${totalPot.toLocaleString()} 🪙** !` : 'Aucun joueur n\'avait misé sur ce cheval.'}`)
            .setColor('#2ECC71')
        ], components: [] });
      }
    });
  }

  // 🏆 CLASSEMENTS & INFOS
  if (commandName === 'leaderboard') {
    const sorted = Object.entries(db.users).map(([id, data]) => ({ id, money: data.money })).sort((a, b) => b.money - a.money).slice(0, 10);
    let desc = ""; const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
    for (let i = 0; i < sorted.length; i++) {
      const u = await client.users.fetch(sorted[i].id).catch(() => null);
      desc += `${medals[i]} **${u ? u.username : 'Inconnu'}** — ${sorted[i].money.toLocaleString()} 🪙\n`;
    }
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 CLASSEMENT DES MILLIONNAIRES').setDescription(desc || 'Aucun joueur.').setColor('#FFD700')] });
  }

  if (commandName === 'bounty') {
    const target = options.getUser('cible'); const amount = options.getInteger('montant');
    if (target.id === user.id || target.bot || amount <= 0 || userData.money < amount) return interaction.reply({ content: '❌ Invalide.', ephemeral: true });
    userData.money -= amount; db.bounties[target.id] = (db.bounties[target.id] || 0) + amount; saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎯 PRIME PLACÉE !').setDescription(`+${amount.toLocaleString()} 🪙 sur la tête de ${target}.`).setColor('#E74C3C')] });
  }

  if (commandName === 'jackpot') {
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎰 JACKPOT PROGRESSIF DU CASINO').setDescription(`Cagnotte globale actuelle : **${(db.jackpot || 1000).toLocaleString()} 🪙**`).setColor('#FFD700')] });
  }

  // ⚙️ COMMANDES ADMINISTRATION
  if (commandName === 'addmoney') {
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Admin requis.', ephemeral: true });
    const targetUser = options.getUser('utilisateur'); const rawAmount = options.getString('montant').trim().toLowerCase();
    const targetData = getUser(targetUser.id);
    if (rawAmount === 'all' || rawAmount === 'max') { targetData.money = 0; } 
    else { const amount = parseInt(rawAmount, 10); if (isNaN(amount)) return interaction.reply({ content: '❌ Invalide.', ephemeral: true }); targetData.money += amount; if (targetData.money < 0) targetData.money = 0; }
    saveDB();
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚙️ [ADMIN] SOLDE MODIFIÉ').setDescription(`Nouveau solde de ${targetUser} : **${targetData.money.toLocaleString()} 🪙**`).setColor('#27AE60')] });
  }

  if (commandName === 'setjob') {
    if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Commande réservée aux administrateurs.', ephemeral: true });

    const targetUser = options.getUser('utilisateur');
    const jobLevel = options.getInteger('metier_niveau');
    const starsInput = options.getInteger('etoiles') ?? 0;

    if (jobLevel < 1 || jobLevel > 10) {
      return interaction.reply({ content: '❌ Niveau de métier invalide. Choisis un chiffre de **1 à 10**.', ephemeral: true });
    }

    if (starsInput < 0 || starsInput > 5) {
      return interaction.reply({ content: '❌ Le nombre d\'étoiles doit être entre **0 et 5**.', ephemeral: true });
    }

    const targetData = getUser(targetUser.id);
    targetData.job_id = jobLevel;
    targetData.stars = starsInput;
    saveDB();

    const selectedJob = JOBS.find(j => j.id === jobLevel);

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('⚙️ [ADMIN] MÉTIER MODIFIÉ')
        .setDescription(`Le statut de ${targetUser} a été mis à jour avec succès !\n\n` +
          `💼 **Nouveau Métier :** Niv.${selectedJob.id} - **${selectedJob.name}**\n` +
          `⭐ **Étoiles :** ${'⭐'.repeat(starsInput)}${'⚫'.repeat(5 - starsInput)} (${starsInput}/5)\n` +
          `🚫 **Nouvelle Limite de Mise :** ${selectedJob.maxBet === Infinity ? 'Illimitée ♾️' : selectedJob.maxBet.toLocaleString() + ' 🪙'}`)
        .setColor('#8E44AD')
    ]});
  }

  // 🎲 GAMBLING STANDARD
  if (commandName === 'duel') {
    const target = options.getUser('adversaire'); const bet = options.getInteger('mise');
    if (target.id === user.id || target.bot || bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Invalide.', ephemeral: true });
    const targetData = getUser(target.id); if (targetData.money < bet) return interaction.reply({ content: '❌ Solde adversaire insuffisant.', ephemeral: true });
    const rowAccept = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('accept_duel').setLabel('✅ Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('refuse_duel').setLabel('❌ Refuser').setStyle(ButtonStyle.Danger));
    const resp = await interaction.reply({ content: `${target}`, embeds: [new EmbedBuilder().setTitle('⚔️ DÉFI EN DUEL !').setDescription(`${user} défie ${target} pour **${bet.toLocaleString()} 🪙** !`)], components: [rowAccept], fetchReply: true });
    const collector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });
    collector.on('collect', async i => {
      if (i.user.id !== target.id) return;
      if (i.customId === 'accept_duel') {
        collector.stop(); userData.money -= bet; targetData.money -= bet; saveDB();
        let c1 = null, c2 = null;
        const rowC = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pierre').setLabel('🪨').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('feuille').setLabel('🍃').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ciseaux').setLabel('✂️').setStyle(ButtonStyle.Primary));
        await i.update({ embeds: [new EmbedBuilder().setTitle('⚔️ DUEL EN COURS').setDescription('Choisissez votre coup en secret !')], components: [rowC] });
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
            return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`🏆 VICTOIRE DE ${winner.username.toUpperCase()} !`).setDescription(`Gain total du pot : **+${totalGain.toLocaleString()} 🪙**`)], components: [] });
          }
        });
      }
    });
  }

  if (commandName === 'crash') {
    const rawBet = options.getString('mise'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; userData.money -= bet; saveDB();
    const crashPoint = +(1 + Math.random() * Math.random() * 8).toFixed(2); let currentMultiplier = 1.00, cashedOut = false;
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cashout').setLabel('💸 CASH OUT').setStyle(ButtonStyle.Success));
    const response = await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🚀 JEU DU CRASH').setDescription(`Multiplicateur actuel : **x1.00** 📈`)], components: [row], fetchReply: true });
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20000 });
    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }
      currentMultiplier += 0.20;
      if (currentMultiplier >= crashPoint) {
        clearInterval(interval); collector.stop(); addToJackpot(bet);
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('💥 CRASH !').setDescription(`Explosion à x${crashPoint.toFixed(2)}. Perte de -${bet.toLocaleString()} 🪙.`)], components: [] });
      } else { await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🚀 JEU DU CRASH').setDescription(`Multiplicateur actuel : **x${currentMultiplier.toFixed(2)}** 📈`)] }).catch(() => {}); }
    }, 1200);
    collector.on('collect', async i => {
      if (i.user.id === user.id && !cashedOut) {
        cashedOut = true; clearInterval(interval); collector.stop();
        const win = Math.floor(bet * currentMultiplier); userData.money += win; saveDB();
        await i.update({ embeds: [new EmbedBuilder().setTitle('🎉 CASH OUT RÉUSSI !').setDescription(`Gagné : **+${win.toLocaleString()} 🪙** (Multiplicateur x${currentMultiplier.toFixed(2)})`)], components: [] });
      }
    });
  }

  if (commandName === 'coinflip') {
    const rawBet = options.getString('mise'); const choice = options.getString('choix'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    setTimeout(async () => {
      const res = Math.random() < 0.5 ? 'pile' : 'face'; const won = res === choice;
      if (won) userData.money += bet; else { userData.money -= bet; addToJackpot(bet); } saveDB();
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(won ? '🎉 VICTOIRE !' : '💥 DÉFAITE !').setDescription(`Résultat : **${res.toUpperCase()}** (${won ? `+${bet.toLocaleString()}` : `-${bet.toLocaleString()}`} 🪙)`)] });
    }, 2000);
  }

  if (commandName === 'shifumi') {
    const rawBet = options.getString('mise'); const choice = options.getString('choix'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    const botC = ['pierre', 'feuille', 'ciseaux'][Math.floor(Math.random() * 3)];
    let outcome = (choice === botC) ? 'draw' : ((choice === 'pierre' && botC === 'ciseaux') || (choice === 'feuille' && botC === 'pierre') || (choice === 'ciseaux' && botC === 'feuille')) ? 'win' : 'lose';
    if (outcome === 'win') userData.money += bet; else if (outcome === 'lose') { userData.money -= bet; addToJackpot(bet); } saveDB();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(outcome === 'win' ? '🎉 GAGNÉ !' : outcome === 'draw' ? '⚖️ ÉGALITÉ' : '💥 PERDU !').setDescription(`Toi: ${choice} vs Bot: ${botC}`)] });
  }

  if (commandName === 'roulette') {
    const rawBet = options.getString('mise'); const type = options.getString('type'); const chosenNum = options.getInteger('numero'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; await interaction.deferReply();
    const winNum = Math.floor(Math.random() * 37); let winColor = (winNum === 0) ? 'vert' : ([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(winNum) ? 'rouge' : 'noir');
    let won = (type === winColor) || (type === 'pair' && winNum !== 0 && winNum % 2 === 0) || (type === 'impair' && winNum % 2 !== 0) || (type === 'numero' && winNum === chosenNum);
    let mult = (type === 'vert' || type === 'numero') ? 35 : 2;
    if (won) userData.money += (bet * mult) - bet; else { userData.money -= bet; addToJackpot(bet); } saveDB();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(won ? '🎰 VICTOIRE À LA ROULETTE !' : '🎰 PERDU !').setDescription(`Chiffre gagnant : **${winNum}** (${winColor.toUpperCase()})\n${won ? `+${((bet * mult) - bet).toLocaleString()}` : `-${bet.toLocaleString()}`} 🪙`)] });
  }

  if (commandName === 'blackjack') {
    const rawBet = options.getString('mise'); const currentJob = JOBS.find(j => j.id === userData.job_id);
    const betResult = parseBet(rawBet, userData.money, currentJob.maxBet); if (!betResult.valid) return interaction.reply({ content: betResult.reason, ephemeral: true });
    const bet = betResult.amount; const deck = [2,3,4,5,6,7,8,9,10,10,10,10,11]; const draw = () => deck[Math.floor(Math.random() * deck.length)];
    let pHand = [draw(), draw()], dHand = [draw(), draw()];
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('hit').setLabel('🃏 Tirer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('stand').setLabel('✋ Rester').setStyle(ButtonStyle.Success));
    const response = await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🃏 TABLE DE BLACKJACK').addFields({ name: 'Tes cartes', value: `${pHand.join(', ')} (Total: ${calculateBlackjackScore(pHand)})` })], components: [row], fetchReply: true });
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });
    collector.on('collect', async i => {
      if (i.user.id !== user.id) return;
      if (i.customId === 'hit') {
        pHand.push(draw());
        if (calculateBlackjackScore(pHand) > 21) {
          userData.money -= bet; addToJackpot(bet); saveDB(); collector.stop();
          return i.update({ embeds: [new EmbedBuilder().setTitle('💥 BUST !').setDescription(`Total: ${calculateBlackjackScore(pHand)}. Perte: -${bet.toLocaleString()} 🪙`)], components: [] });
        }
        await i.update({ embeds: [new EmbedBuilder().setTitle('🃏 TABLE DE BLACKJACK').addFields({ name: 'Tes cartes', value: `${pHand.join(', ')} (Total: ${calculateBlackjackScore(pHand)})` })] });
      }
      if (i.customId === 'stand') {
        collector.stop(); while (calculateBlackjackScore(dHand) < 17) dHand.push(draw());
        const pS = calculateBlackjackScore(pHand), dS = calculateBlackjackScore(dHand);
        let win = (dS > 21 || pS > dS), drawG = (pS === dS);
        if (win) userData.money += bet; else if (!drawG) { userData.money -= bet; addToJackpot(bet); } saveDB();
        return i.update({ embeds: [new EmbedBuilder().setTitle(win ? '🎉 VICTOIRE BLACKJACK !' : drawG ? '⚖️ ÉGALITÉ' : '💥 PERDU !').setDescription(`Toi: ${pS} vs Banque: ${dS}`)], components: [] });
      }
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
