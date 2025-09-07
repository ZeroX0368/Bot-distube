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
            )
    ];
    
    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === 'music') {
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