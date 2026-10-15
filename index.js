const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const fs = require('fs');

// Base de données en fichier JSON local (100% compatible mobile & cloud)
const DB_FILE = './database.json';
let db = {};
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { db = {}; }
}
function saveDB() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getUser(userId) {
  if (!db[userId]) {
    db[userId] = {
      money: 500,
      job_id: 1,
      stars: 0,
      last_daily: 0,
      last_work: 0,
      last_claim: 0
    };
    saveDB();
  }
  return db[userId];
}

// Les 10 Métiers & Étoiles d'investissement
const JOBS = [
  { id: 1, name: "Plongeur de Casino", cost: 0, starCost: 100, gainPerStar: 10 },
  { id: 2, name: "Valet de Parking", cost: 1000, starCost: 300, gainPerStar: 25 },
  { id: 3, name: "Barman de Salon", cost: 3500, starCost: 800, gainPerStar: 60 },
  { id: 4, name: "Croupier de Blackjack", cost: 10000, starCost: 2000, gainPerStar: 150 },
  { id: 5, name: "Videur VIP", cost: 25000, starCost: 5000, gainPerStar: 350 },
  { id: 6, name: "Chef de Salle", cost: 60000, starCost: 12000, gainPerStar: 800 },
  { id: 7, name: "Manager du Casino", cost: 150000, starCost: 30000, gainPerStar: 1800 },
  { id: 8, name: "Investisseur Partenaire", cost: 400000, starCost: 80000, gainPerStar: 4500 },
  { id: 9, name: "Actionnaire Majoritaire", cost: 1000000, starCost: 200000, gainPerStar: 11000 },
  { id: 10, name: "Propriétaire du Casino", cost: 2500000, starCost: 500000, gainPerStar: 28000 }
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', async () => {
  console.log(`🎰 Casino Bot connecté en tant que ${client.user.tag}`);
  
  const commands = [
    { name: 'daily', description: 'Reçois un don aléatoire (jusqu\'à 300 pièces)' },
    { name: 'work', description: 'Travaille pour ton salaire immédiat' },
    { name: 'claim', description: 'Récolte tes revenus passifs d\'investissements' },
    { name: 'profile', description: 'Affiche ton solde, métier et étoiles' },
    { name: 'invest', description: 'Achète une étoile ou change de métier' },
    { name: 'coinflip', description: 'Pile ou Face avec animation', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { name: 'choix', type: 3, description: 'pile ou face', required: true, choices: [{name: 'Pile', value: 'pile'}, {name: 'Face', value: 'face'}]}
    ]},
    { name: 'shifumi', description: 'Pierre-Feuille-Ciseaux', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { name: 'choix', type: 3, description: 'ton choix', required: true, choices: [{name: 'Pierre', value: 'pierre'}, {name: 'Feuille', value: 'feuille'}, {name: 'Ciseaux', value: 'ciseaux'}]}
    ]},
    { name: 'roulette', description: 'Roulette de casino animée', options: [
        { name: 'mise', type: 4, description: 'Montant à miser', required: true },
        { name: 'couleur', type: 3, description: 'rouge ou noir', required: true, choices: [{name: '🔴 Rouge (x2)', value: 'rouge'}, {name: '⚫ Noir (x2)', value: 'noir'}]}
    ]},
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

  // 3. CLAIM (Revenu Passif)
  if (commandName === 'claim') {
    const hours = Math.floor((now - userData.last_claim) / (1000 * 60 * 60));
    if (hours < 1) return interaction.reply({ content: `⏳ Laisse couler au moins 1 heure d'investissement.`, ephemeral: true });
    
    const currentJob = JOBS.find(j => j.id === userData.job_id);
    const hourlyGain = userData.stars * currentJob.gainPerStar;
    const totalGain = hourlyGain * hours;

    if (totalGain <= 0) return interaction.reply({ content: `❌ Tu n'as pas encore investi dans d'étoiles pour générer un salaire passif.`, ephemeral: true });

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
          { name: '💼 Post', value: `Niv.${currentJob.id} - **${currentJob.name}**`, inline: true },
          { name: '⭐ Investissements', value: `${starsStr} (${userData.stars}/5)` },
          { name: '📈 Revenu Passif', value: `**+${passiveHour.toLocaleString()} 🪙 / heure**` }
        )
        .setColor('#9B59B6')
    ]});
  }

  // 5. INVEST (Étoiles & Métier)
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
        new EmbedBuilder().setTitle('🎉 PROMOTION ACCORDÉE !').setDescription(`Tu devrais maintenant être appelé : **${nextJob.name}** !\nInvestis dans ce nouveau poste pour exploser tes revenus passifs !`).setColor('#E91E63')
      ]});
    }
  }

  // ================= GAMBLING =================

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
      userData.money += won ? bet : -bet;
      saveDB();

      await interaction.editReply({ embeds: [
        new EmbedBuilder()
          .setTitle(won ? '🎉 VICTOIRE !' : '💥 DÉFAITE !')
          .setDescription(`Résultat : **${result.toUpperCase()}** !\n${won ? `Tu gagnes **+${bet} 🪙**` : `Tu perds **-${bet} 🪙**`}`)
          .setColor(won ? '#2ECC71' : '#E74C3C')
      ]});
    }, 2500);
  }

  // ✂️ SHIFUMI
  if (commandName === 'shifumi') {
    const bet = options.getInteger('mise');
    const choice = options.getString('choix');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    await interaction.deferReply();
    const steps = ['🪨 Pierre...', '🍃 Feuille...', '✂️ Ciseaux !'];
    for (let s of steps) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(s).setColor('#3498DB')] });
      await new Promise(r => setTimeout(r, 700));
    }

    const botChoice = ['pierre', 'feuille', 'ciseaux'][Math.floor(Math.random() * 3)];
    let outcome = 'draw';
    if ((choice === 'pierre' && botChoice === 'ciseaux') || (choice === 'feuille' && botChoice === 'pierre') || (choice === 'ciseaux' && botChoice === 'feuille')) outcome = 'win';
    else if (choice !== botChoice) outcome = 'lose';

    if (outcome === 'win') userData.money += bet;
    if (outcome === 'lose') userData.money -= bet;
    saveDB();

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(outcome === 'win' ? '🎉 GAGNÉ !' : outcome === 'draw' ? '⚖️ ÉGALITÉ' : '💥 PERDU !')
        .setDescription(`Toi : **${choice}** vs Casino : **${botChoice}**\n${outcome === 'win' ? `+${bet} 🪙` : outcome === 'lose' ? `-${bet} 🪙` : 'Mise récupérée.'}`)
        .setColor(outcome === 'win' ? '#2ECC71' : outcome === 'draw' ? '#F1C40F' : '#E74C3C')
    ]});
  }

  // 🎰 ROULETTE
  if (commandName === 'roulette') {
    const bet = options.getInteger('mise');
    const colorChoice = options.getString('couleur');
    if (bet <= 0 || userData.money < bet) return interaction.reply({ content: '❌ Solde insuffisant.', ephemeral: true });

    await interaction.deferReply();
    const sequence = ['🔴 19', '⚫ 31', '🟢 0', '🔴 7', '⚫ 15', '🔴 36'];
    for (let s of sequence) {
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🎰 La roulette tourne...').setDescription(`👉 [ **${s}** ] 👈`).setColor('#34495E')] });
      await new Promise(r => setTimeout(r, 500));
    }

    const isRed = Math.random() < 0.48;
    const finalColor = isRed ? 'rouge' : 'noir';
    const won = finalColor === colorChoice;
    userData.money += won ? bet : -bet;
    saveDB();

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(won ? '🎰 VICTOIRE À LA ROULETTE !' : '🎰 PERDU !')
        .setDescription(`La bille s'arrête sur : **${finalColor.toUpperCase()}** (${isRed ? '🔴' : '⚫'})\n${won ? `Tu gagnes **+${bet} 🪙**` : `Tu perds **-${bet} 🪙**`}`)
        .setColor(won ? '#2ECC71' : '#E74C3C')
    ]});
  }

  // 🃏 BLACKJACK (AVEC BOUTONS INTERACTIFS)
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
          saveDB();
          collector.stop('bust');
          return i.update({ embeds: [
            new EmbedBuilder().setTitle('💥 DEPASSEMENT (BUST) !').setDescription(`Tu as fait **${getScore(playerHand)}**. Tu perds **-${bet} 🪙**.`).setColor('#E74C3C')
          ], components: [] });
        }
        await i.update({ embeds: [getEmbed()] });
      }

      if (i.customId === 'stand') {
        collector.stop('stand');
        // Tour de la banque
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
        else if (!drawGame) userData.money -= bet;
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
