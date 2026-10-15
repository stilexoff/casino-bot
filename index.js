const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');

// Base de données en fichier JSON local
const DB_FILE = './database.json';
let db = { users: {}, jackpot: 1000 };

if (fs.existsSync(DB_FILE)) {
  try { 
    const loadedData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (loadedData.users) db = loadedData;
    else db = { users: loadedData, jackpot: 1000 };
  } catch (e) { 
    db = { users: {}, jackpot: 1000 }; 
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
  const tax = Math.floor(amount * 0.10); // 10% des pertes alimentent le jackpot
  if (tax > 0) {
    db.jackpot = (db.jackpot || 1000) + tax;
    saveDB();
  }
}

// Les 10 Métiers & Étoiles d'investissement
// 💼 Métiers & Plafonds de Mise Dynamiques (maxBet)
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

// Vérification du plafond de mise
function checkBetLimit(userData, bet) {
  const currentJob = JOBS.find(j => j.id === userData.job_id);
  if (bet > currentJob.maxBet) {
    return { valid: false, max: currentJob.maxBet, jobName: currentJob.name };
  }
  return { valid: true };
}

// Algorithme de calcul du Blackjack avec gestion dynamique des As (1 ou 11)
function calculateBlackjackScore(hand) {
  let score = 0;
  let aces = 0;

  for (let card of hand) {
    if (card === 11) {
      aces += 1;
      score += 11;
    } else {
      score += card;
    }
  }

  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }

  return score;
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log(`🎰 Casino Bot connecté en tant que ${client.user.tag}`);
  
  const commands = [
    { name: 'daily', description: 'Reçois un don aléatoire (jusqu\'à 300 pièces)' },
    { name: 'work', description: 'Travaille pour ton salaire immédiat' },
    { name: 'claim', description: 'Récolte tes revenus passifs d\'investissements' },
    { name: 'profile', description: 'Affiche ton solde, métier et étoiles' },
    { name: 'invest', description: 'Achète une étoile ou change de métier' },
    { name: 'jackpot', description: 'Consulte le montant actuel du Jackpot Progressif' },
    { name: 'leaderboard', description: 'Affiche le TOP 10 des joueurs les plus riches' },

    {
      name: 'addmoney',
      description: '[Admin] Ajoute de l\'argent à un utilisateur',
      options: [
        { name: 'utilisateur', type: 6, description: 'Le joueur à qui donner des pièces', required: true },
        { name: 'montant', type: 4, description: 'Le montant de pièces à ajouter', required: true }
      ]
    },
    { name: 'coinflip', description: 'Pile ou Face avec animation', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { name: 'choix', type: 3, description: 'pile ou face', required: true, choices: [{name: 'Pile', value: 'pile'}, {name: 'Face', value: 'face'}]}
    ]},
    { name: 'shifumi', description: 'Pierre-Feuille-Ciseaux contre le bot', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { name: 'choix', type: 3, description: 'ton choix', required: true, choices: [{name: 'Pierre', value: 'pierre'}, {name: 'Feuille', value: 'feuille'}, {name: 'Ciseaux', value: 'ciseaux'}]}
    ]},
    {
      name: 'duel',
      description: 'Défie un autre membre au Shifumi ',
      options: [
        { name: 'adversaire', type: 6, description: 'Le membre à défier', required: true },
        { name: 'mise', type: 4, description: 'Montant de la mise du duel', required: true }
      ]
    },
    {
      name: 'crash',
      description: 'Jeu du Crash : Encaisse avant que la fusée n\'explose !',
      options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true }
      ]
    },
    {
      name: 'roulette',
      description: 'Roulette de casino (Rouge, Noir, Pair, Impair, Vert ou Numéro exact)',
      options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { 
          name: 'type', 
          type: 3, 
          description: 'Type de mise', 
          required: true, 
          choices: [
            { name: '🔴 Rouge (x2)', value: 'rouge' },
            { name: '⚫ Noir (x2)', value: 'noir' },
            { name: '⚖️ Pair (x2)', value: 'pair' },
            { name: '⚡ Impair (x2)', value: 'impair' },
            { name: '🟢 Vert / 0 (x35 + JACKPOT)', value: 'vert' },
            { name: '🎯 Numéro exact (x35)', value: 'numero' }
          ] 
        },
        { name: 'numero', type: 4, description: 'Si tu as choisi "Numéro exact", écris un chiffre entre 0 et 36', required: false }
      ]
    },
    { name: 'blackjack', description: 'Joue au Blackjack contre la banque', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true }
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
      return interaction.reply({ content: `⏳ Reviens dans **${hours}h** pour récupérer ton don daily !`, ephemeral: true });
    }
    const gain = Math.floor(Math.random() * 300) + 1;
    userData.money += gain;
    userData.last_daily = now;
    saveDB();
    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('🎁 Don Quotidien').setDescription(`Tu as reçu **+${gain} 🪙** pièces du Casino !`).setColor('#FFD700')
    ]});
  }

  // 2. WORK
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
    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle(`💼 Service : ${currentJob.name}`).setDescription(`Tu as terminé ton quart et gagné **+${gain} 🪙** !`).setColor('#2ECC71')
    ]});
  }

  // 3. CLAIM
  if (commandName === 'claim') {
    const hours = Math.floor((now - userData.last_claim) / (1000 * 60 * 60));
    if (hours < 1) return interaction.reply({ content: `⏳ Laisse couler au moins 1 heure d'investissement.`, ephemeral: true });
    
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const hourlyGain = userData.stars * currentJob.gainPerStar;
    const totalGain = hourlyGain * hours;

    if (totalGain <= 0) return interaction.reply({ content: `❌ Tu n'as pas encore investi d'étoiles pour générer un salaire passif.`, ephemeral: true });

    userData.money += totalGain;
    userData.last_claim = now;
    saveDB();

    return interaction.reply({ embeds: [
      new EmbedBuilder().setTitle('📈 Salaire Récolté').setDescription(`Tu as récupéré **+${totalGain.toLocaleString()} 🪙** pour tes ${hours}h d'investissements !`).setColor('#1ABC9C')
    ]});
  }

  // 4. PROFILE
  if (commandName === 'profile') {
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const starsStr = '⭐'.repeat(userData.stars) + '⚫'.repeat(5 - userData.stars);
    const passiveHour = userData.stars * currentJob.gainPerStar;

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle(`🎰 Fiche Joueur : ${user.username}`)
        .addFields(
          { name: '💵 Solde', value: `**${userData.money.toLocaleString()} 🪙**`, inline: true },
          { name: '💼 Poste', value: `Niv.${currentJob.id} - **${currentJob.name}**`, inline: true },
          { name: '⭐ Investissements', value: `${starsStr} (${userData.stars}/5)` },
          { name: '📈 Revenu Passif', value: `**+${passiveHour.toLocaleString()} 🪙 / heure**` }
        )
        .setColor('#9B59B6')
    ]});
  }

  // 5. INVEST
  if (commandName === 'invest') {
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    
    if (userData.stars < 5) {
      if (userData.money < currentJob.starCost) return interaction.reply({ content: `❌ Étoile pour **${currentJob.name}** coûte **${currentJob.starCost} 🪙**. Solde insuffisant.`, ephemeral: true });
      userData.money -= currentJob.starCost;
      userData.stars += 1;
      saveDB();
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('⭐ Étoile Débloquée !').setDescription(`Étoile **${userData.stars}/5** acquise !\nGain horaire augmenté de **+${currentJob.gainPerStar} 🪙/h**.`).setColor('#F1C40F')
      ]});
    } else {
      const nextJob = JOBS.find(j => j.id === userData.job_id + 1);
      if (!nextJob) return interaction.reply({ content: `👑 Tu es déjà le Propriétaire absolu du Casino !`, ephemeral: true });
      if (userData.money < nextJob.cost) return interaction.reply({ content: `❌ Promotion pour **${nextJob.name}** coûte **${nextJob.cost.toLocaleString()} 🪙**.`, ephemeral: true });
      
      userData.money -= nextJob.cost;
      userData.job_id += 1;
      userData.stars = 0;
      saveDB();
      return interaction.reply({ embeds: [
        new EmbedBuilder().setTitle('🎉 PROMOTION ACCORDÉE !').setDescription(`Tu es promu : **${nextJob.name}** !\nInvestis dans ce nouveau poste pour booster tes revenus passifs !`).setColor('#E91E63')
      ]});
    }
  }

  // 6. JACKPOT DISPLAY
  if (commandName === 'jackpot') {
    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('🎰 JACKPOT PROGRESSIF DU CASINO')
        .setDescription(`Cagnotte actuelle : **${(db.jackpot || 1000).toLocaleString()} 🪙** !\n\n*10% de toutes les pertes des joueurs alimentent cette cagnotte. Pour la décrocher, gagne un pari sur le **0 (VERT)** à la roulette !*`)
        .setColor('#FFD700')
    ]});
  }

  // 7. ADMIN ADDMONEY
  if (commandName === 'addmoney') {
    if (!interaction.member.permissions.has('Administrator')) {
      return interaction.reply({ content: '❌ Commande réservée aux administrateurs du serveur.', ephemeral: true });
    }
    const targetUser = options.getUser('utilisateur');
    const amount = options.getInteger('montant');
    if (amount <= 0) return interaction.reply({ content: '❌ Le montant doit être supérieur à 0.', ephemeral: true });

    const targetData = getUser(targetUser.id);
    targetData.money += amount;
    saveDB();

    return interaction.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('⚙️ [ADMIN] Injection de fonds')
        .setDescription(`Ajout de **+${amount.toLocaleString()} 🪙** sur le compte de ${targetUser}.\nNouveau solde : **${targetData.money.toLocaleString()} 🪙**`)
        .setColor('#27AE60')
    ]});
  }

  // ================= GAMBLING =================

  // 🚀 CRASH GAME
  if (commandName === 'crash') {
    const bet = options.getInteger('mise');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    userData.money -= bet; // On prélève la mise
    saveDB();

    // Calcul du point de crash aléatoire
    const crashPoint = +(1 + Math.random() * Math.random() * 8).toFixed(2); // entre 1.00x et ~9.00x
    let currentMultiplier = 1.00;
    let cashedOut = false;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cashout').setLabel('💸 CASH OUT').setStyle(ButtonStyle.Success)
    );

    const getEmbed = (mult, finished = false, crashed = false) => new EmbedBuilder()
      .setTitle('🚀 Jeu du Crash')
      .setDescription(crashed 
        ? `💥 **CRASH À x${mult.toFixed(2)} !**\nTu as perdu **-${bet} 🪙**.` 
        : finished 
        ? `🎉 **CASH OUT RÉUSSI À x${mult.toFixed(2)} !**\nTu remportes **+${Math.floor(bet * mult).toLocaleString()} 🪙** !`
        : `Multiplicateur actuel : **x${mult.toFixed(2)}** 📈\n*Clique vite sur Cash Out avant le Crash !*`)
      .setColor(crashed ? '#E74C3C' : finished ? '#2ECC71' : '#F39C12');

    const response = await interaction.reply({ embeds: [getEmbed(currentMultiplier)], components: [row], fetchReply: true });

    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 20000 });

    const interval = setInterval(async () => {
      if (cashedOut) { clearInterval(interval); return; }

      currentMultiplier += 0.20;
      if (currentMultiplier >= crashPoint) {
        clearInterval(interval);
        collector.stop('crashed');
        addToJackpot(bet); // Pertes -> Jackpot

        await interaction.editReply({ embeds: [getEmbed(crashPoint, false, true)], components: [] });
      } else {
        await interaction.editReply({ embeds: [getEmbed(currentMultiplier)] }).catch(() => {});
      }
    }, 1200);

    collector.on('collect', async i => {
      if (i.user.id !== user.id) return i.reply({ content: 'Pas ta partie !', ephemeral: true });
      if (i.customId === 'cashout' && !cashedOut) {
        cashedOut = true;
        clearInterval(interval);
        collector.stop('cashed_out');

        const winAmount = Math.floor(bet * currentMultiplier);
        userData.money += winAmount;
        saveDB();

        await i.update({ embeds: [getEmbed(currentMultiplier, true, false)], components: [] });
      }
    });
  }

  // ⚔️ DUEL SHIFUMI SANS TAXE
  if (commandName === 'duel') {
    const target = options.getUser('adversaire');
    const bet = options.getInteger('mise');

    if (target.id === user.id || target.bot) return interaction.reply({ content: '❌ Tu ne peux pas te défier toi-même ou un bot !', ephemeral: true });
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    const targetData = getUser(target.id);
    if (targetData.money < bet) return interaction.reply({ content: `❌ ${target.username} n'a pas assez de pièces pour ce duel !`, ephemeral: true });

    const rowAccept = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_duel').setLabel('✅ Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('refuse_duel').setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
    );

    const embedReq = new EmbedBuilder()
      .setTitle('⚔️ DEFIS SHIFUMI EN DUEL !')
      .setDescription(`${user} défie ${target} pour une mise de **${bet.toLocaleString()} 🪙** !\n*(100% du pot au gagnant, 0% de taxe !)*`)
      .setColor('#9B59B6');

    const resp = await interaction.reply({ content: `${target}`, embeds: [embedReq], components: [rowAccept], fetchReply: true });

    const collector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

    collector.on('collect', async i => {
      if (i.user.id !== target.id) return i.reply({ content: 'Ce défi ne t\'est pas destiné.', ephemeral: true });

      if (i.customId === 'refuse_duel') {
        collector.stop('refused');
        return i.update({ embeds: [new EmbedBuilder().setTitle('❌ Défi refusé.').setColor('#E74C3C')], components: [] });
      }

      if (i.customId === 'accept_duel') {
        collector.stop('accepted');

        // Retrait des mises
        userData.money -= bet;
        targetData.money -= bet;
        saveDB();

        let choice1 = null;
        let choice2 = null;

        const rowChoice = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('pierre').setLabel('🪨 Pierre').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('feuille').setLabel('🍃 Feuille').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('ciseaux').setLabel('✂️ Ciseaux').setStyle(ButtonStyle.Primary)
        );

        await i.update({ 
          embeds: [new EmbedBuilder().setTitle('⚔️ DUEL ACCEPTÉ !').setDescription(`Les deux joueurs doivent choisir leur coup ci-dessous. Vos choix restent secrets.`).setColor('#3498DB')],
          components: [rowChoice]
        });

        const gameCollector = resp.createMessageComponentCollector({ componentType: ComponentType.Button, time: 30000 });

        gameCollector.on('collect', async btn => {
          if (btn.user.id !== user.id && btn.user.id !== target.id) return btn.reply({ content: 'Tu n\'es pas dans ce duel.', ephemeral: true });

          if (btn.user.id === user.id && !choice1) choice1 = btn.customId;
          if (btn.user.id === target.id && !choice2) choice2 = btn.customId;

          await btn.reply({ content: `Choix enregistré : **${btn.customId.toUpperCase()}** !`, ephemeral: true });

          if (choice1 && choice2) {
            gameCollector.stop('done');

            let winner = null;
            if (choice1 === choice2) winner = 'draw';
            else if (
              (choice1 === 'pierre' && choice2 === 'ciseaux') ||
              (choice1 === 'feuille' && choice2 === 'pierre') ||
              (choice1 === 'ciseaux' && choice2 === 'feuille')
            ) winner = user;
            else winner = target;

            if (winner === 'draw') {
              userData.money += bet;
              targetData.money += bet;
              saveDB();
              return interaction.editReply({ embeds: [
                new EmbedBuilder().setTitle('⚖️ ÉGALITÉ DANS LE DUEL !').setDescription(`${user} (${choice1}) vs ${target} (${choice2})\nLes mises ont été remboursées.`).setColor('#F1C40F')
              ], components: [] });
            } else {
              const totalGain = bet * 2; // 0% TAXE
              const winnerData = getUser(winner.id);
              winnerData.money += totalGain;
              saveDB();

              return interaction.editReply({ embeds: [
                new EmbedBuilder()
                  .setTitle(`🏆 VICTOIRE DE ${winner.username.toUpperCase()} !`)
                  .setDescription(`${user} (**${choice1}**) vs ${target} (**${choice2}**)\n\n🎉 ${winner} remporte l'intégralité du pot soit **${totalGain.toLocaleString()} 🪙** !`)
                  .setColor('#2ECC71')
              ], components: [] });
            }
          }
        });
      }
    });
  }

  // 🎲 PILE OU FACE
  if (commandName === 'coinflip') {
    const bet = options.getInteger('mise');
    const choice = options.getString('choix');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    await interaction.deferReply();
    await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🪙 La pièce vole dans les airs...').setDescription('🔄 🪙 🔄').setColor('#E67E22')] });

    setTimeout(async () => {
      const result = Math.random() < 0.5 ? 'pile' : 'face';
      const won = result === choice;
      if (won) userData.money += bet;
      else { userData.money -= bet; addToJackpot(bet); }
      saveDB();

      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(won ? '🎉 VICTOIRE !' : '💥 DÉFAITE !')
          .setDescription(`Résultat : **${result.toUpperCase()}** !\n${won ? `Tu gagnes **+${bet} 🪙**` : `Tu perds **-${bet} 🪙**`}`)
          .setColor(won ? '#2ECC71' : '#E74C3C')
      ]});
    }, 2500);
  }

  // ✂️ SHIFUMI VS BOT
  if (commandName === 'shifumi') {
    const bet = options.getInteger('mise');
    const choice = options.getString('choix');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    await interaction.deferReply();
    const botChoice = ['pierre', 'feuille', 'ciseaux'][Math.floor(Math.random() * 3)];
    let outcome = 'draw';
    if ((choice === 'pierre' && botChoice === 'ciseaux') || (choice === 'feuille' && botChoice === 'pierre') || (choice === 'ciseaux' && botChoice === 'feuille')) outcome = 'win';
    else if (choice !== botChoice) outcome = 'lose';

    if (outcome === 'win') userData.money += bet;
    if (outcome === 'lose') { userData.money -= bet; addToJackpot(bet); }
    saveDB();

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(outcome === 'win' ? '🎉 GAGNÉ !' : outcome === 'draw' ? '⚖️ ÉGALITÉ' : '💥 PERDU !')
        .setDescription(`Toi : **${choice}** vs Casino : **${botChoice}**\n${outcome === 'win' ? `+${bet} 🪙` : outcome === 'lose' ? `-${bet} 🪙` : 'Mise récupérée.'}`)
        .setColor(outcome === 'win' ? '#2ECC71' : outcome === 'draw' ? '#F1C40F' : '#E74C3C')
    ]});
  }

  // 🎰 ROULETTE + JACKPOT SUR LE 0
  if (commandName === 'roulette') {
    const bet = options.getInteger('mise');
    const type = options.getString('type');
    const chosenNum = options.getInteger('numero');

    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });
    if (type === 'numero' && (chosenNum === null || chosenNum < 0 || chosenNum > 36)) {
      return interaction.reply({ content: '❌ Indique un chiffre entre 0 et 36 dans `numero`.', ephemeral: true });
    }

    await interaction.deferReply();
    const winningNumber = Math.floor(Math.random() * 37);
    
    let winningColor = 'vert';
    if (winningNumber !== 0) {
      const reds = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
      winningColor = reds.includes(winningNumber) ? 'rouge' : 'noir';
    }
    const winningParity = winningNumber === 0 ? 'zero' : (winningNumber % 2 === 0 ? 'pair' : 'impair');

    let won = false;
    let multiplier = 0;
    let wonJackpot = false;

    if (type === 'rouge' && winningColor === 'rouge') { won = true; multiplier = 2; }
    else if (type === 'noir' && winningColor === 'noir') { won = true; multiplier = 2; }
    else if (type === 'pair' && winningParity === 'pair') { won = true; multiplier = 2; }
    else if (type === 'impair' && winningParity === 'impair') { won = true; multiplier = 2; }
    else if (type === 'vert' && winningNumber === 0) { won = true; multiplier = 35; wonJackpot = true; }
    else if (type === 'numero' && winningNumber === chosenNum) { 
      won = true; 
      multiplier = 35; 
      if (winningNumber === 0) wonJackpot = true;
    }

    let netGain = 0;
    if (won) {
      netGain = bet * (multiplier - 1);
      if (wonJackpot) {
        netGain += (db.jackpot || 1000);
        db.jackpot = 1000; // Reset du jackpot à 1000
      }
      userData.money += netGain;
    } else {
      netGain = -bet;
      userData.money -= bet;
      addToJackpot(bet);
    }
    saveDB();

    const colorEmoji = winningColor === 'rouge' ? '🔴' : (winningColor === 'noir' ? '⚫' : '🟢');

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(wonJackpot ? '🚨 JACKPOT DÉCROCHÉ !!! 🚨' : won ? '🎰 VICTOIRE À LA ROULETTE !' : '🎰 PERDU !')
        .setDescription(`Chiffre gagnant : **${winningNumber}** (${colorEmoji} ${winningColor.toUpperCase()})\n\n` +
          `${wonJackpot ? `👑 **INCROYABLE !** Tu as décroché le **JACKPOT** et remportes **+${netGain.toLocaleString()} 🪙** !` : won ? `🎉 Tu remportes **+${netGain.toLocaleString()} 🪙** !` : `💥 Tu perds **-${bet} 🪙**.`}`)
        .setColor(wonJackpot ? '#FFD700' : won ? '#2ECC71' : '#E74C3C')
    ]});
  }

  // 🃏 BLACKJACK
  if (commandName === 'blackjack') {
    const bet = options.getInteger('mise');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    const deck = [2,3,4,5,6,7,8,9,10,10,10,10,11];
    const draw = () => deck[Math.floor(Math.random() * deck.length)];

    let playerHand = [draw(), draw()];
    let dealerHand = [draw(), draw()];

    const getScore = (hand) => hand.reduce((a, b) => a + b, 0);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hit').setLabel('🃏 Tirer').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('stand').setLabel('✋ Rester').setStyle(ButtonStyle.Success)
    );

    const getEmbed = (status = 'À toi de jouer !') => new EmbedBuilder()
      .setTitle('🃏 Table de Blackjack')
      .addFields(
        { name: 'Tes cartes', value: `${playerHand.join(', ')} (Total: **${getScore(playerHand)}**)`, inline: true },
        { name: 'Banque', value: `${dealerHand[0]}, ❓`, inline: true },
        { name: 'Statut', value: status }
      )
      .setColor('#2C3E50');

    const response = await interaction.reply({ embeds: [getEmbed()], components: [row], fetchReply: true });
    const collector = response.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

    collector.on('collect', async i => {
      if (i.user.id !== user.id) return i.reply({ content: 'Pas ta partie !', ephemeral: true });

      if (i.customId === 'hit') {
        playerHand.push(draw());
        if (getScore(playerHand) > 21) {
          userData.money -= bet;
          addToJackpot(bet);
          saveDB();
          collector.stop('bust');
          return i.update({ embeds: [
            new EmbedBuilder().setTitle('💥 DÉPASSEMENT (BUST) !').setDescription(`Tu as fait **${getScore(playerHand)}**. Tu perds **-${bet} 🪙**.`).setColor('#E74C3C')
          ], components: [] });
        }
        await i.update({ embeds: [getEmbed()] });
      }

      if (i.customId === 'stand') {
        collector.stop('stand');
        while (getScore(dealerHand) < 17) {
          dealerHand.push(draw());
        }
        const pScore = getScore(playerHand);
        const dScore = getScore(dealerHand);

        let win = false;
        let drawGame = false;

        if (dScore > 21 || pScore > dScore) win = true;
        else if (pScore === dScore) drawGame = true;

        if (win) userData.money += bet;
        else if (!drawGame) { userData.money -= bet; addToJackpot(bet); }
        saveDB();

        return i.update({ embeds: [
          new EmbedBuilder()
            .setTitle(win ? '🎉 VICTOIRE BLACKJACK !' : drawGame ? '⚖️ ÉGALITÉ !' : '💥 LE CROUPIIER GAGNE !')
            .addFields(
              { name: 'Ton total', value: `${pScore}`, inline: true },
              { name: 'Total Croupier', value: `${dScore}`, inline: true },
              { name: 'Résultat', value: win ? `+${bet} 🪙` : drawGame ? 'Mise rendue' : `-${bet} 🪙` }
            )
            .setColor(win ? '#2ECC71' : drawGame ? '#F1C40F' : '#E74C3C')
        ], components: [] });
      }
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
