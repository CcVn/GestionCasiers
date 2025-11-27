// ============ MODAL STATS DES CONNEXIONS =====================

async function showConnectionStats() {
    const panel = document.getElementById('connectionStatsPanel');
    const content = document.getElementById('connectionStatsContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const data = await fetchJSON(`${API_URL}/stats/connections/summary`, {
            credentials: 'include'
        });
        renderConnectionStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats connexions:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des statistiques...</p>
            </div>
        `;
    }
}

function renderConnectionStats(data) {
    const content = document.getElementById('connectionStatsContent');
    
    let html = '';
    
    // Cartes récapitulatives
    html += `
        <div class="stats-summary">
            <div class="summary-card total">
                <div class="value">${data.total.total}</div>
                <div class="label">Total</div>
            </div>
            <div class="summary-card admin">
                <div class="value">${data.total.admin}</div>
                <div class="label">Admin</div>
            </div>
            <div class="summary-card guest">
                <div class="value">${data.total.guest}</div>
                <div class="label">Guest</div>
            </div>
        </div>
    `;
    
    // Tableau des statistiques par période
    html += `
        <div class="stats-table-container">
            <table class="stats-table">
                <thead>
                    <tr>
                        <th>Période</th>
                        <th style="text-align: center;">Admin</th>
                        <th style="text-align: center;">Guest</th>
                        <th style="text-align: center;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="period-col">📅 Aujourd'hui</td>
                        <td class="admin-col" style="text-align: center;">${data.today.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.today.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.today.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📆 Semaine en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.week.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.week.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.week.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📊 Mois en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.month.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.month.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.month.total}</td>
                    </tr>
                    <tr>
                        <td class="period-col">📈 Année en cours</td>
                        <td class="admin-col" style="text-align: center;">${data.year.admin}</td>
                        <td class="guest-col" style="text-align: center;">${data.year.guest}</td>
                        <td class="total-col" style="text-align: center;">${data.year.total}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    
    // Graphique des 7 derniers jours
    if (data.last7Days && data.last7Days.length > 0) {
        // Grouper par date
        const dailyData = {};
        data.last7Days.forEach(stat => {
            if (!dailyData[stat.date]) {
                dailyData[stat.date] = { admin: 0, guest: 0 };
            }
            dailyData[stat.date][stat.role] = stat.count;
        });
        
        // Générer les 7 derniers jours même si pas de données
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        // Trouver le max pour la largeur des barres
        let maxCount = 0;
        dates.forEach(date => {
            const admin = dailyData[date]?.admin || 0;
            const guest = dailyData[date]?.guest || 0;
            const total = admin + guest;
            if (total > maxCount) maxCount = total;
        });
        
        html += `
            <div class="chart-container">
                <h3>Connexions des 7 derniers jours</h3>
        `;
        
        dates.forEach(date => {
            const admin = dailyData[date]?.admin || 0;
            const guest = dailyData[date]?.guest || 0;
            const total = admin + guest;
            
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('fr-FR', { 
                weekday: 'short', 
                day: '2-digit', 
                month: '2-digit' 
            });
            
            const adminWidth = maxCount > 0 ? (admin / maxCount * 100) : 0;
            const guestWidth = maxCount > 0 ? (guest / maxCount * 100) : 0;
            
            html += `
                <div class="chart-bar">
                    <div class="date">${formattedDate}</div>
                    <div class="bars">
                        ${admin > 0 ? `<div class="bar admin" style="width: ${adminWidth}%;" title="Admin: ${admin}">${admin}</div>` : ''}
                        ${guest > 0 ? `<div class="bar guest" style="width: ${guestWidth}%;" title="Guest: ${guest}">${guest}</div>` : ''}
                        ${total === 0 ? '<div style="color: var(--text-tertiary); font-size: 12px;">Aucune connexion</div>' : ''}
                    </div>
                    <div style="width: 40px; text-align: right; font-weight: 600; color: var(--text-secondary);">${total}</div>
                </div>
            `;
        });
        
        html += `
                <div class="chart-legend">
                    <div class="chart-legend-item admin">
                        <div class="color"></div>
                        <span>Admin</span>
                    </div>
                    <div class="chart-legend-item guest">
                        <div class="color"></div>
                        <span>Guest</span>
                    </div>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucune donnée de connexion disponible</p>
            </div>
        `;
    }
    
// AJOUTER : 15 dernières connexions
    if (data.recentConnections && data.recentConnections.length > 0) {
        html += `
            <div style="margin-top: 32px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">15 dernières connexions</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>Date & Heure</th>
                                <th>Rôle</th>
                                <th>Utilisateur</th>
                                <th>Adresse IP</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.recentConnections.forEach(conn => {
            // Si c'est une connexion agrégée (sans timestamp exact)
            if (conn.date && !conn.timestamp) {
                const dateObj = new Date(conn.date + 'T00:00:00');
                const formattedDate = dateObj.toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric'
                });
                
                const roleClass = conn.role === 'admin' ? 'admin-col' : 'guest-col';
                const roleIcon = conn.role === 'admin' ? '🔒' : '👁️';
                
                html += `
                    <tr>
                        <td style="white-space: nowrap;">${formattedDate}</td>
                        <td class="${roleClass}" style="text-align: center;">${roleIcon} ${conn.role}</td>
                        <td colspan="2" style="text-align: center; color: var(--text-tertiary); font-size: 12px;">${conn.count} connexion(s) ce jour</td>
                    </tr>
                `;
            } else {
                // Si c'est une connexion individuelle (avec timestamp)
                const timestamp = new Date(conn.timestamp + 'Z');
                const formattedDateTime = timestamp.toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'Europe/Paris' // Force le fuseau horaire
                });
                
                const roleClass = conn.role === 'admin' ? 'admin-col' : 'guest-col';
                const roleIcon = conn.role === 'admin' ? '🔒' : '👁️';
                
                html += `
                    <tr>
                        <td style="white-space: nowrap;">${formattedDateTime}</td>
                        <td class="${roleClass}" style="text-align: center;">${roleIcon} ${conn.role}</td>
                        <td>${conn.userName || '—'}</td>
                        <td style="font-family: monospace; font-size: 12px;">${conn.ipAddress || '—'}</td>
                    </tr>
                `;
            }
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function closeConnectionStats() {
    document.getElementById('connectionStatsPanel').classList.remove('active');
}

// Rendre les fonctions globales
window.showConnectionStats = showConnectionStats;
window.renderConnectionStats = renderConnectionStats;
window.closeConnectionStats = closeConnectionStats;
