// Simple botstats module
module.exports = {
    commandsUsed: 0,
    guildsCount: 0,
    updateCommandCount() {
        this.commandsUsed++;
    },
    updateGuildCount(count) {
        this.guildsCount = count;
    }
};
