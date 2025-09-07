
// Blacklist management system
const fs = require('fs');
const path = require('path');

const blacklistFile = path.join(__dirname, 'blacklist.json');

// Initialize blacklist file if it doesn't exist
if (!fs.existsSync(blacklistFile)) {
    fs.writeFileSync(blacklistFile, JSON.stringify({
        users: [],
        servers: []
    }, null, 2));
}

function loadBlacklist() {
    try {
        const data = fs.readFileSync(blacklistFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error loading blacklist:', error);
        return { users: [], servers: [] };
    }
}

function saveBlacklist(blacklist) {
    try {
        fs.writeFileSync(blacklistFile, JSON.stringify(blacklist, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving blacklist:', error);
        return false;
    }
}

module.exports = {
    loadBlacklist,
    saveBlacklist,
    
    addUser(userId, username) {
        const blacklist = loadBlacklist();
        const userEntry = { id: userId, username: username, addedAt: new Date().toISOString() };
        
        if (!blacklist.users.find(u => u.id === userId)) {
            blacklist.users.push(userEntry);
            return saveBlacklist(blacklist);
        }
        return false; // User already blacklisted
    },
    
    removeUser(userId) {
        const blacklist = loadBlacklist();
        const index = blacklist.users.findIndex(u => u.id === userId);
        
        if (index !== -1) {
            blacklist.users.splice(index, 1);
            return saveBlacklist(blacklist);
        }
        return false; // User not found
    },
    
    addServer(serverId, serverName) {
        const blacklist = loadBlacklist();
        const serverEntry = { id: serverId, name: serverName, addedAt: new Date().toISOString() };
        
        if (!blacklist.servers.find(s => s.id === serverId)) {
            blacklist.servers.push(serverEntry);
            return saveBlacklist(blacklist);
        }
        return false; // Server already blacklisted
    },
    
    removeServer(serverId) {
        const blacklist = loadBlacklist();
        const index = blacklist.servers.findIndex(s => s.id === serverId);
        
        if (index !== -1) {
            blacklist.servers.splice(index, 1);
            return saveBlacklist(blacklist);
        }
        return false; // Server not found
    },
    
    isUserBlacklisted(userId) {
        const blacklist = loadBlacklist();
        return blacklist.users.some(u => u.id === userId);
    },
    
    isServerBlacklisted(serverId) {
        const blacklist = loadBlacklist();
        return blacklist.servers.some(s => s.id === serverId);
    },
    
    getBlacklistedUsers(page = 0, limit = 10) {
        const blacklist = loadBlacklist();
        const start = page * limit;
        const end = start + limit;
        return {
            users: blacklist.users.slice(start, end),
            total: blacklist.users.length,
            hasMore: end < blacklist.users.length
        };
    },
    
    getBlacklistedServers(page = 0, limit = 10) {
        const blacklist = loadBlacklist();
        const start = page * limit;
        const end = start + limit;
        return {
            servers: blacklist.servers.slice(start, end),
            total: blacklist.servers.length,
            hasMore: end < blacklist.servers.length
        };
    }
};
