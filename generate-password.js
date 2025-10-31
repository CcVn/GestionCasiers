const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question('Entrez le mot de passe admin à hasher: ', (password) => {
    if (!password || password.length < 8) {
        console.error('❌ Le mot de passe doit faire au moins 8 caractères');
        rl.close();
        return;
    }
    
    const saltRounds = 10;
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) {
            console.error('❌ Erreur lors du hashage:', err);
            rl.close();
            return;
        }
        
        console.log('\n✅ Hash généré avec succès !');
        console.log('\nAjoutez cette ligne dans votre fichier .env :');
        console.log(`ADMIN_PASSWORD_HASH=${hash}`);
        console.log('\nPuis commentez ou supprimez la ligne ADMIN_PASSWORD');
        console.log('\n⚠️  Conservez ce mot de passe en lieu sûr !');
        
        rl.close();
    });
});