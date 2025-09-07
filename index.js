const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const YouTube = require('youtube-sr').default;
const botstats = require('./shared/botstats');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Music queue and player management
const musicQueues = new Map();
const audioPlayers = new Map();
const voiceConnections = new Map();

class MusicQueue {
    constructor() {
        this.songs = [];
        this.currentSong = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.loop = false;
        this.volume = 50;
        this.bassBoost = 0;
        this.shuffle = false;
    }
}

// Utility functions
function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

async function searchYouTube(query) {
    try {
        const results = await YouTube.search(query, { limit: 1, type: 'video' });
        return results[0] || null;
    } catch (error) {
        console.error('YouTube search error:', error);
        return null;
    }
}

async function playNextSong(guildId, interaction = null) {
    const queue = musicQueues.get(guildId);
    const player = audioPlayers.get(guildId);
    const connection = voiceConnections.get(guildId);
    
    if (!queue || !player || !connection) return;
    
    if (queue.songs.length === 0) {
        queue.isPlaying = false;
        queue.currentSong = null;
        if (interaction) {
            interaction.followUp({ content: '🎵 Queue ended. No more songs to play.' });
        }
        return;
    }
    
    const song = queue.songs.shift();
    queue.currentSong = song;
    queue.isPlaying = true;
    
    try {
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            quality: 'highestaudio',
            highWaterMark: 1 << 25
        });
        
        const resource = createAudioResource(stream, {
            inputType: 'arbitrary',
            inlineVolume: true
        });
        
        resource.volume?.setVolume(queue.volume / 100);
        player.play(resource);
        
        if (interaction) {
            const embed = new EmbedBuilder()
                .setColor(config.EmbedColor)
                .setTitle('🎵 Now Playing')
                .setDescription(`**${song.title}**`)
                .addFields(
                    { name: 'Duration', value: song.duration, inline: true },
                    { name: 'Requested by', value: song.requester, inline: true }
                )
                .setThumbnail(song.thumbnail)
                .setTimestamp();
            
            interaction.followUp({ embeds: [embed] });
        }
    } catch (error) {
        console.error('Error playing song:', error);
        if (interaction) {
            interaction.followUp({ content: '❌ Error playing this song. Skipping to next...' });
        }
        playNextSong(guildId, interaction);
    }
}

// Register slash commands
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    const commands = [
        new SlashCommandBuilder()
            .setName('music')
            .setDescription('Music commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('help')
                    .setDescription('Get information about the music category commands')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('play')
                    .setDescription('Start the music')
                    .addStringOption(option =>
                        option.setName('query')
                            .setDescription('Song name or YouTube URL')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('pause')
                    .setDescription('Pause the music')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('resume')
                    .setDescription('Resume the music')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('skip')
                    .setDescription('Skip the current song')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('stop')
                    .setDescription('Stop the music')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('queue')
                    .setDescription('See the music queue')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('clear')
                    .setDescription('Delete the music queue')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('volume')
                    .setDescription('Set the music volume')
                    .addIntegerOption(option =>
                        option.setName('level')
                            .setDescription('Volume level (0-100)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(100)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('loop')
                    .setDescription('Loop the music')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('shuffle')
                    .setDescription('Shuffle the music')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('playing')
                    .setDescription('See which song is playing now')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove a song from the queue')
                    .addIntegerOption(option =>
                        option.setName('position')
                            .setDescription('Position in queue to remove')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('skipto')
                    .setDescription('Skip to a new song')
                    .addIntegerOption(option =>
                        option.setName('position')
                            .setDescription('Position in queue to skip to')
                            .setRequired(true)
                            .setMinValue(1)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('seek')
                    .setDescription('Seek the current playing music')
                    .addStringOption(option =>
                        option.setName('time')
                            .setDescription('Time to seek to (e.g., 1:30)')
                            .setRequired(true)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('previous')
                    .setDescription('Play previous song')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('bassboost')
                    .setDescription('Set the bassboost level')
                    .addIntegerOption(option =>
                        option.setName('level')
                            .setDescription('Bassboost level (0-100)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(100)
                    )
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('lyrics')
                    .setDescription('Get the lyrics of the current song')
            ),
        
        new SlashCommandBuilder()
            .setName('bot')
            .setDescription('Bot utility commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('help')
                    .setDescription('Get general bot help information')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('info')
                    .setDescription('Get bot information and statistics')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('invite')
                    .setDescription('Get bot invite link')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('support')
                    .setDescription('Get support server link')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('uptime')
                    .setDescription('Get bot uptime')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('ping')
                    .setDescription('Get bot latency')
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('feedback')
                    .setDescription('Send feedback to the bot developers')
                    .addStringOption(option =>
                        option.setName('message')
                            .setDescription('Your feedback message')
                            .setRequired(true)
                    )
            )
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// Bot start time for uptime calculation
const botStartTime = Date.now();

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    // Check if command is used in a guild (not in DMs)
    if (!interaction.guild) {
        return interaction.reply({
            content: '❌ This bot only works in servers, not in DMs!',
            ephemeral: true
        });
    }
    
    if (interaction.commandName === 'bot') {
        botstats.updateCommandCount();
        
        const subcommand = interaction.options.getSubcommand();
        
        switch (subcommand) {
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🤖 Bot Help')
                    .setDescription('Welcome to the Discord Music Bot! Here are the available commands:')
                    .addFields(
                        { name: '🎵 Music Commands', value: 'Use `/music help` to see all music-related commands', inline: false },
                        { name: '🤖 Bot Commands', value: '`/bot info` - Bot information\n`/bot invite` - Get invite link\n`/bot support` - Support server\n`/bot uptime` - Bot uptime\n`/bot ping` - Bot latency\n`/bot feedback` - Send feedback', inline: false },
                        { name: '💡 Getting Started', value: 'Join a voice channel and use `/music play <song>` to start playing music!', inline: false }
                    )
                    .setFooter({ text: `Bot made with ❤️ | Total commands used: ${botstats.commandsUsed}` })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [helpEmbed] });
                break;
                
            case 'info':
                // Update guild count
                botstats.updateGuildCount(client.guilds.cache.size);
                
                const uptime = Date.now() - botStartTime;
                const uptimeSeconds = Math.floor(uptime / 1000);
                const days = Math.floor(uptimeSeconds / 86400);
                const hours = Math.floor((uptimeSeconds % 86400) / 3600);
                const minutes = Math.floor((uptimeSeconds % 3600) / 60);
                const seconds = uptimeSeconds % 60;
                
                const infoEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🤖 Bot Information')
                    .setDescription('Discord Music Bot with YouTube integration')
                    .addFields(
                        { name: '📊 Statistics', value: `**Servers**: ${botstats.guildsCount}\n**Commands Used**: ${botstats.commandsUsed}\n**Users**: ${client.users.cache.size}`, inline: true },
                        { name: '⏱️ Uptime', value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
                        { name: '🔧 Technical Info', value: `**Node.js**: ${process.version}\n**Discord.js**: v14\n**Memory**: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true }
                    )
                    .setThumbnail(client.user.displayAvatarURL())
                    .setFooter({ text: 'Made with ❤️ using Discord.js' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [infoEmbed] });
                break;
                
            case 'invite':
                const inviteEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('📬 Invite the Bot')
                    .setDescription('Add this music bot to your server!')
                    .addFields(
                        { name: '🔗 Invite Link', value: `[Click here to invite me!](https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=36868096&scope=bot%20applications.commands)`, inline: false },
                        { name: '🔐 Required Permissions', value: 'Connect, Speak, Send Messages, Use Slash Commands', inline: false }
                    )
                    .setThumbnail(client.user.displayAvatarURL())
                    .setTimestamp();
                
                await interaction.reply({ embeds: [inviteEmbed] });
                break;
                
            case 'support':
                const supportEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🆘 Support')
                    .setDescription('Need help or have questions?')
                    .addFields(
                        { name: '📞 Support Server', value: config.Support ? `[Join our support server](${config.Support})` : 'Support server not configured', inline: false },
                        { name: '📝 Feedback', value: 'Use `/bot feedback <message>` to send us feedback directly!', inline: false }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [supportEmbed] });
                break;
                
            case 'uptime':
                const currentUptime = Date.now() - botStartTime;
                const currentUptimeSeconds = Math.floor(currentUptime / 1000);
                const uptimeDays = Math.floor(currentUptimeSeconds / 86400);
                const uptimeHours = Math.floor((currentUptimeSeconds % 86400) / 3600);
                const uptimeMinutes = Math.floor((currentUptimeSeconds % 3600) / 60);
                const uptimeSecs = currentUptimeSeconds % 60;
                
                const uptimeEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('⏱️ Bot Uptime')
                    .setDescription(`The bot has been online for:`)
                    .addFields(
                        { name: '📅 Days', value: `${uptimeDays}`, inline: true },
                        { name: '⏰ Hours', value: `${uptimeHours}`, inline: true },
                        { name: '⏱️ Minutes', value: `${uptimeMinutes}`, inline: true },
                        { name: '⏳ Seconds', value: `${uptimeSecs}`, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [uptimeEmbed] });
                break;
                
            case 'ping':
                const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
                const pingEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🏓 Pong!')
                    .addFields(
                        { name: '📡 Latency', value: `${sent.createdTimestamp - interaction.createdTimestamp}ms`, inline: true },
                        { name: '💓 API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ content: '', embeds: [pingEmbed] });
                break;
                
            case 'feedback':
                const feedbackMessage = interaction.options.getString('message');
                
                // Send feedback to configured channel if available
                if (config.FeedBackChannelID) {
                    try {
                        const feedbackChannel = await client.channels.fetch(config.FeedBackChannelID);
                        if (feedbackChannel) {
                            const feedbackEmbed = new EmbedBuilder()
                                .setColor(config.EmbedColor)
                                .setTitle('📝 New Feedback')
                                .setDescription(feedbackMessage)
                                .addFields(
                                    { name: 'From', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                    { name: 'Server', value: `${interaction.guild.name} (${interaction.guild.id})`, inline: true }
                                )
                                .setTimestamp();
                            
                            await feedbackChannel.send({ embeds: [feedbackEmbed] });
                        }
                    } catch (error) {
                        console.error('Error sending feedback:', error);
                    }
                }
                
                const confirmEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('✅ Feedback Sent')
                    .setDescription('Thank you for your feedback! We appreciate your input.')
                    .addFields(
                        { name: '📝 Your Message', value: feedbackMessage, inline: false }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });
                break;
        }
    } else if (interaction.commandName === 'music') {
        botstats.updateCommandCount();
        
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const member = interaction.member;
        
        // Check if user is in a voice channel for most commands
        const voiceCommands = ['play', 'pause', 'resume', 'skip', 'stop', 'volume', 'seek'];
        if (voiceCommands.includes(subcommand) && !member.voice.channel) {
            return interaction.reply({ 
                content: '❌ You need to be in a voice channel to use this command!',
                ephemeral: true
            });
        }
        
        // Initialize music queue if not exists
        if (!musicQueues.has(guildId)) {
            musicQueues.set(guildId, new MusicQueue());
        }
        
        const queue = musicQueues.get(guildId);
        
        switch (subcommand) {
            case 'help':
                const helpEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🎵 Music Commands Help')
                    .setDescription('Get help with the commands in `music`')
                    .addFields(
                        { name: '🎵 **Play & Control**', value: '`play` - Start the music\n`pause` - Pause the music\n`resume` - Resume the music\n`stop` - Stop the music', inline: false },
                        { name: '⏭️ **Navigation**', value: '`skip` - Skip the current song\n`previous` - Play previous song\n`skipto` - Skip to a new song\n`seek` - Seek the current playing music', inline: false },
                        { name: '📜 **Queue Management**', value: '`queue` - See the music queue\n`clear` - Delete the music queue\n`remove` - Remove a song from the queue\n`shuffle` - Shuffle the music', inline: false },
                        { name: '🔧 **Audio Settings**', value: '`volume` - Set the music volume\n`bassboost` - Set the bassboost level\n`loop` - Loop the music', inline: false },
                        { name: '📋 **Information**', value: '`playing` - See which song is playing now\n`lyrics` - Get the lyrics of the current song', inline: false }
                    )
                    .setTimestamp();
                
                await interaction.reply({ embeds: [helpEmbed] });
                break;
                
            case 'play':
                await interaction.deferReply();
                
                const query = interaction.options.getString('query');
                const voiceChannel = member.voice.channel;
                
                try {
                    // Join voice channel
                    let connection = voiceConnections.get(guildId);
                    if (!connection || connection.state.status === VoiceConnectionStatus.Disconnected) {
                        connection = joinVoiceChannel({
                            channelId: voiceChannel.id,
                            guildId: guildId,
                            adapterCreator: interaction.guild.voiceAdapterCreator,
                        });
                        voiceConnections.set(guildId, connection);
                        
                        // Create audio player
                        const player = createAudioPlayer();
                        audioPlayers.set(guildId, player);
                        connection.subscribe(player);
                        
                        player.on(AudioPlayerStatus.Idle, () => {
                            if (queue.loop && queue.currentSong) {
                                queue.songs.unshift(queue.currentSong);
                            }
                            playNextSong(guildId);
                        });
                    }
                    
                    // Search for song
                    let song;
                    if (query.includes('youtube.com') || query.includes('youtu.be')) {
                        try {
                            const info = await ytdl.getInfo(query);
                            song = {
                                title: info.videoDetails.title,
                                url: info.videoDetails.video_url,
                                duration: formatDuration(parseInt(info.videoDetails.lengthSeconds)),
                                thumbnail: info.videoDetails.thumbnails[0]?.url,
                                requester: interaction.user.tag
                            };
                        } catch (error) {
                            return interaction.editReply({ content: '❌ Invalid YouTube URL!' });
                        }
                    } else {
                        const result = await searchYouTube(query);
                        if (!result) {
                            return interaction.editReply({ content: '❌ No results found for your search!' });
                        }
                        
                        song = {
                            title: result.title,
                            url: result.url,
                            duration: result.duration ? formatDuration(result.duration / 1000) : 'Unknown',
                            thumbnail: result.thumbnail?.url,
                            requester: interaction.user.tag
                        };
                    }
                    
                    queue.songs.push(song);
                    
                    if (!queue.isPlaying) {
                        playNextSong(guildId, interaction);
                    } else {
                        const embed = new EmbedBuilder()
                            .setColor(config.EmbedColor)
                            .setTitle('✅ Added to Queue')
                            .setDescription(`**${song.title}**`)
                            .addFields(
                                { name: 'Duration', value: song.duration, inline: true },
                                { name: 'Position in queue', value: `${queue.songs.length}`, inline: true },
                                { name: 'Requested by', value: song.requester, inline: true }
                            )
                            .setThumbnail(song.thumbnail);
                        
                        interaction.editReply({ embeds: [embed] });
                    }
                } catch (error) {
                    console.error('Play command error:', error);
                    interaction.editReply({ content: '❌ An error occurred while trying to play the song.' });
                }
                break;
                
            case 'pause':
                const pausePlayer = audioPlayers.get(guildId);
                if (!pausePlayer || !queue.isPlaying) {
                    return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
                }
                
                pausePlayer.pause();
                queue.isPaused = true;
                interaction.reply({ content: '⏸️ Music paused.' });
                break;
                
            case 'resume':
                const resumePlayer = audioPlayers.get(guildId);
                if (!resumePlayer || !queue.isPaused) {
                    return interaction.reply({ content: '❌ Music is not paused!', ephemeral: true });
                }
                
                resumePlayer.unpause();
                queue.isPaused = false;
                interaction.reply({ content: '▶️ Music resumed.' });
                break;
                
            case 'skip':
                const skipPlayer = audioPlayers.get(guildId);
                if (!skipPlayer || !queue.isPlaying) {
                    return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
                }
                
                skipPlayer.stop();
                interaction.reply({ content: '⏭️ Skipped the current song.' });
                break;
                
            case 'stop':
                const stopPlayer = audioPlayers.get(guildId);
                const connection = voiceConnections.get(guildId);
                
                if (stopPlayer) stopPlayer.stop();
                if (connection) connection.destroy();
                
                queue.songs = [];
                queue.currentSong = null;
                queue.isPlaying = false;
                queue.isPaused = false;
                
                audioPlayers.delete(guildId);
                voiceConnections.delete(guildId);
                
                interaction.reply({ content: '⏹️ Music stopped and disconnected from voice channel.' });
                break;
                
            case 'queue':
                if (queue.songs.length === 0 && !queue.currentSong) {
                    return interaction.reply({ content: '❌ The queue is empty!', ephemeral: true });
                }
                
                let queueDescription = '';
                
                if (queue.currentSong) {
                    queueDescription += `**🎵 Now Playing:**\n${queue.currentSong.title}\n\n`;
                }
                
                if (queue.songs.length > 0) {
                    queueDescription += '**📜 Up Next:**\n';
                    queue.songs.slice(0, 10).forEach((song, index) => {
                        queueDescription += `${index + 1}. ${song.title}\n`;
                    });
                    
                    if (queue.songs.length > 10) {
                        queueDescription += `\n... and ${queue.songs.length - 10} more songs`;
                    }
                }
                
                const queueEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('📜 Music Queue')
                    .setDescription(queueDescription)
                    .setFooter({ text: `Total songs in queue: ${queue.songs.length}` });
                
                interaction.reply({ embeds: [queueEmbed] });
                break;
                
            case 'clear':
                queue.songs = [];
                interaction.reply({ content: '🗑️ Queue cleared!' });
                break;
                
            case 'volume':
                const volumeLevel = interaction.options.getInteger('level');
                const volumePlayer = audioPlayers.get(guildId);
                
                if (!volumePlayer || !queue.isPlaying) {
                    return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
                }
                
                queue.volume = volumeLevel;
                // Note: Volume adjustment would require access to the current resource
                interaction.reply({ content: `🔊 Volume set to ${volumeLevel}%` });
                break;
                
            case 'loop':
                queue.loop = !queue.loop;
                interaction.reply({ content: `🔁 Loop ${queue.loop ? 'enabled' : 'disabled'}.` });
                break;
                
            case 'shuffle':
                if (queue.songs.length < 2) {
                    return interaction.reply({ content: '❌ Not enough songs in queue to shuffle!', ephemeral: true });
                }
                
                for (let i = queue.songs.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [queue.songs[i], queue.songs[j]] = [queue.songs[j], queue.songs[i]];
                }
                
                interaction.reply({ content: '🔀 Queue shuffled!' });
                break;
                
            case 'playing':
                if (!queue.currentSong) {
                    return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
                }
                
                const nowPlayingEmbed = new EmbedBuilder()
                    .setColor(config.EmbedColor)
                    .setTitle('🎵 Currently Playing')
                    .setDescription(`**${queue.currentSong.title}**`)
                    .addFields(
                        { name: 'Duration', value: queue.currentSong.duration, inline: true },
                        { name: 'Requested by', value: queue.currentSong.requester, inline: true },
                        { name: 'Volume', value: `${queue.volume}%`, inline: true }
                    )
                    .setThumbnail(queue.currentSong.thumbnail);
                
                interaction.reply({ embeds: [nowPlayingEmbed] });
                break;
                
            case 'remove':
                const position = interaction.options.getInteger('position');
                
                if (position > queue.songs.length) {
                    return interaction.reply({ content: '❌ Invalid queue position!', ephemeral: true });
                }
                
                const removedSong = queue.songs.splice(position - 1, 1)[0];
                interaction.reply({ content: `🗑️ Removed **${removedSong.title}** from the queue.` });
                break;
                
            case 'skipto':
                const skipToPosition = interaction.options.getInteger('position');
                
                if (skipToPosition > queue.songs.length) {
                    return interaction.reply({ content: '❌ Invalid queue position!', ephemeral: true });
                }
                
                const skipToPlayer = audioPlayers.get(guildId);
                if (!skipToPlayer) {
                    return interaction.reply({ content: '❌ No music player found!', ephemeral: true });
                }
                
                // Move songs before the target position out of queue
                queue.songs.splice(0, skipToPosition - 1);
                skipToPlayer.stop(); // This will trigger playing the next song
                
                interaction.reply({ content: `⏭️ Skipped to position ${skipToPosition} in the queue.` });
                break;
                
            case 'seek':
                interaction.reply({ content: '❌ Seek functionality is not available with the current audio setup.' });
                break;
                
            case 'previous':
                interaction.reply({ content: '❌ Previous song functionality is not available in this version.' });
                break;
                
            case 'bassboost':
                const bassLevel = interaction.options.getInteger('level');
                queue.bassBoost = bassLevel;
                interaction.reply({ content: `🎛️ Bass boost set to ${bassLevel}% (Note: This is a visual setting only in this version)` });
                break;
                
            case 'lyrics':
                if (!queue.currentSong) {
                    return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
                }
                
                interaction.reply({ content: `🎤 Lyrics search for "${queue.currentSong.title}" is not available in this version. You can search for lyrics manually on Google or other lyrics websites.` });
                break;
        }
    }
});

// Login with bot token
const token = config.token;
if (!token) {
    console.error('❌ DISCORD_TOKEN not found in environment variables or config.json!');
    console.log('Please set your Discord bot token using the DISCORD_TOKEN environment variable or add it to config.json.');
    process.exit(1);
}

client.login(token).catch(error => {
    console.error('❌ Failed to login:', error);
    console.log('Please check your DISCORD_TOKEN and try again.');
});
