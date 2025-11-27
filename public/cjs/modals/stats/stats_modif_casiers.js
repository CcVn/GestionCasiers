// ============ MODAL STATS MODIFICATIONS DES CASIERS ============

async function showModificationStats() {
    const panel = document.getElementById('modificationStatsPanel');
    const content = document.getElementById('modificationStatsContent');
    
    // Afficher le panel
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const data = await fetchJSON(`${API_URL}/stats/modifications`, {
            credentials: 'include'
        });
        renderModificationStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats modifications:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Erreur de chargement...</p>
            </div>
        `;
    }
}

function renderModificationStats(data) {
    const content = document.getElementById('modificationStatsContent');
    let html = '';
    
    // Cartes récapitulatives
    html += `
        <div class="stats-summary">
            <div class="summary-card today">
                <div class="value">${data.today}</div>
                <div class="label">Aujourd'hui</div>
            </div>
            <div class="summary-card week">
                <div class="value">${data.week}</div>
                <div class="label">Cette semaine</div>
            </div>
            <div class="summary-card month">
                <div class="value">${data.month}</div>
                <div class="label">Ce mois</div>
            </div>
            <div class="summary-card total">
                <div class="value">${data.total}</div>
                <div class="label">Total</div>
            </div>
        </div>
    `;
    
    // Répartition par type d'action
    if (data.byAction && data.byAction.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Répartition par type</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        const maxCount = Math.max(...data.byAction.map(a => a.count));
        const actionColors = {
            'ATTRIBUTION': '#10b981',
            'MODIFICATION': '#3b82f6',
            'LIBÉRATION': '#ef4444'
        };
        
        data.byAction.forEach(action => {
            const percentage = (action.count / data.total * 100).toFixed(1);
            const barWidth = (action.count / maxCount * 100).toFixed(1);
            const color = actionColors[action.action] || '#667eea';
            
            html += `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                        <span style="font-weight: 600;">${action.action}</span>
                        <span style="color: var(--text-secondary);">${action.count} (${percentage}%)</span>
                    </div>
                    <div style="background: var(--border-light); border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: ${color}; height: 100%; width: ${barWidth}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Utilisateurs les plus actifs
    if (data.topUsers && data.topUsers.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Utilisateurs les plus actifs</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        data.topUsers.forEach((user, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '👤';
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; ${index < data.topUsers.length - 1 ? 'border-bottom: 1px solid var(--border-light);' : ''}">
                    <span style="font-size: 14px;">${medal} <strong>${user.userName}</strong></span>
                    <span style="background: var(--primary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 600;">${user.count}</span>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Graphique des 7 derniers jours
    if (data.dailyActivity && data.dailyActivity.length > 0) {
        html += `
            <div class="chart-container" style="margin-bottom: 24px;">
                <h3>Activité des 7 derniers jours</h3>
        `;
        
        // Générer les 7 derniers jours même si pas de données
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            dates.push(date.toISOString().split('T')[0]);
        }
        
        const activityMap = {};
        data.dailyActivity.forEach(item => {
            activityMap[item.date] = item.count;
        });
        
        const maxCount = Math.max(...dates.map(date => activityMap[date] || 0), 1);
        
        dates.forEach(date => {
            const count = activityMap[date] || 0;
            const dateObj = new Date(date + 'T00:00:00');
            const formattedDate = dateObj.toLocaleDateString('fr-FR', { 
                weekday: 'short', 
                day: '2-digit', 
                month: '2-digit' 
            });
            
            const barWidth = maxCount > 0 ? (count / maxCount * 100) : 0;
            
            html += `
                <div class="chart-bar">
                    <div class="date">${formattedDate}</div>
                    <div class="bars">
                        ${count > 0 ? `<div class="bar" style="width: ${barWidth}%; background: var(--primary-color);" title="${count} modifications">${count}</div>` : '<div style="color: var(--text-tertiary); font-size: 12px;">Aucune modification</div>'}
                    </div>
                    <div style="width: 40px; text-align: right; font-weight: 600; color: var(--text-secondary);">${count}</div>
                </div>
            `;
        });
        
        html += `
            </div>
        `;
    }
    
    // 10 dernières modifications
    if (data.recentModifications && data.recentModifications.length > 0) {
        html += `
            <div>
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">10 dernières modifications</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>Casier</th>
                                <th>Action</th>
                                <th>Patient</th>
                                <th>N°IPP</th>
                                <th>Zone</th>
                                <th>Par</th>
                                <th>Quand</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.recentModifications.forEach(mod => {
            const timestamp = new Date(mod.timestamp + 'Z');
            const formattedDate = timestamp.toLocaleDateString('fr-FR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone: 'Europe/Paris'
            });
            
            const actionColor = mod.action === 'ATTRIBUTION' ? '#10b981' : 
                               mod.action === 'MODIFICATION' ? '#3b82f6' : '#ef4444';
            
            const patientInfo = mod.name ? `${anonymizeName(mod.name)} ${anonymizeFirstName(mod.firstName)}` : '—';
            
            html += `
                <tr>
                    <td><strong>${mod.lockerNumber}</strong></td>
                    <td><span style="color: ${actionColor}; font-weight: 600;">${mod.action}</span></td>
                    <td>${patientInfo}</td>
                    <td>${mod.code || '—'}</td>
                    <td>${mod.zone || '—'}</td>
                    <td><span style="font-size: 12px;">${mod.userName || 'Inconnu'}</span></td>
                    <td style="font-size: 12px; white-space: nowrap;">${formattedDate}</td>
                </tr>
            `;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    } else {
        html += `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <p style="font-size: 18px; margin-bottom: 10px;">📭</p>
                <p>Aucune modification enregistrée</p>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

function closeModificationStats() {
    document.getElementById('modificationStatsPanel').classList.remove('active');
}

// Rendre les fonctions globales
window.showModificationStats = showModificationStats;
window.renderModificationStats = renderModificationStats;
window.closeModificationStats = closeModificationStats;