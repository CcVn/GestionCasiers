// ================== MODAL STATS PATIENTS =========================

// Modal affichant quelques stats sur la base patients
async function showClientsStats() {
    const panel = document.getElementById('clientsStatsPanel');
    const content = document.getElementById('clientsStatsContent');
    
    // Afficher le panel avec un loader
    panel.classList.add('active');
    content.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">⏳ Chargement des statistiques...</p>';
    
    try {
        const data = await fetchJSON(`${API_URL}/clients/stats`, {
            credentials: 'include'
        });
        renderClientsStats(data);
        
    } catch (err) {
        console.error('Erreur chargement stats patients:', err);
        content.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; padding: 60px;">
                <div class="spinner"></div>
                <p style="margin-top: 20px; font-weight: 600; color: var(--text-primary);">Chargement des statistiques...</p>
            </div>
        `;
    }
}

// Générer le modal
function renderClientsStats(data) {
    const content = document.getElementById('clientsStatsContent');
    
    // Formater la date du dernier import
    let lastImportInfo = 'Aucun import';
    if (data.lastImport) {
        const importDate = new Date(data.lastImport.importDate);
        console.log(data.lastImport.importDate, 'Date import', importDate, 'Now:', Date.now())
        const daysSince = Math.floor((Date.now() - importDate) / (1000 * 60 * 60 * 24));
        lastImportInfo = `${importDate} (il y a ${daysSince} jour${daysSince > 1 ? 's' : ''})`;
    }
    
    // Construire le HTML
    let html = `
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">${data.total}</div>
                <div class="stat-label">Patients total</div>
            </div>
    `;
    
    // Stats par zone
    if (data.byZone && data.byZone.length > 0) {
        data.byZone.slice(0, 3).forEach(zone => {
            html += `
                <div class="stat-card">
                    <div class="stat-value">${zone.count}</div>
                    <div class="stat-label">${zone.zone || 'Non défini'}</div>
                </div>
            `;
        });
    }
    
    // Stats par sexe
    if (data.bySex && data.bySex.length > 0) {
        data.bySex.forEach(sex => {
            const sexLabel = sex.sex === 'M' ? 'Hommes' : sex.sex === 'F' ? 'Femmes' : 'Non défini';
            html += `
                <div class="stat-card">
                    <div class="stat-value">${sex.count}</div>
                    <div class="stat-label">${sexLabel}</div>
                </div>
            `;
        });
    }
    
    html += `</div>`;
    
    // Info dernier import
    html += `
        <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <p style="font-size: 13px; color: var(--text-secondary); margin: 0 0 4px 0;">Dernier import</p>
                    <p style="font-size: 15px; font-weight: 600; margin: 0;">${lastImportInfo}</p>
                    ${data.lastImport ? `<p style="font-size: 12px; color: var(--text-tertiary); margin: 4px 0 0 0;">Par ${data.lastImport.userName}</p>` : ''}
                </div>
                ${data.lastImport ? `<div style="font-size: 24px; color: var(--primary-color);">📥</div>` : ''}
            </div>
        </div>
    `;
    
    // Répartition par zone (graphique textuel)
    if (data.byZone && data.byZone.length > 0) {
        html += `
            <div style="margin-bottom: 24px;">
                <h3 style="font-size: 15px; font-weight: 600; margin-bottom: 12px;">Répartition par zone</h3>
                <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px;">
        `;
        
        const maxCount = Math.max(...data.byZone.map(z => z.count));
        data.byZone.forEach(zone => {
            const percentage = (zone.count / data.total * 100).toFixed(1);
            const barWidth = (zone.count / maxCount * 100).toFixed(1);
            html += `
                <div style="margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 13px;">
                        <span style="font-weight: 600;">${zone.zone || 'Non défini'}</span>
                        <span style="color: var(--text-secondary);">${zone.count} (${percentage}%)</span>
                    </div>
                    <div style="background: var(--border-light); border-radius: 4px; height: 8px; overflow: hidden;">
                        <div style="background: var(--primary-color); height: 100%; width: ${barWidth}%; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });
        
        html += `
                </div>
            </div>
        `;
    }
    
    // Aperçu des 10 premiers patients
    if (data.preview && data.preview.length > 0) {
        html += `
            <div class="clients-preview-section">
                <h3>Aperçu des données (10 premiers patients)</h3>
                <div style="overflow-x: auto;">
                    <table class="clients-preview-table">
                        <thead>
                            <tr>
                                <th>IPP</th>
                                <th>Nom</th>
                                <th>Prénom</th>
                                <th>DDN</th>
                                <th>Sexe</th>
                                <th>Zone</th>
                                <th>Entrée</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        
        data.preview.forEach(client => {
            html += `
                <tr>
                    <td><strong>${client.ipp}</strong></td>
                    <td>${client.name || '—'}</td>
                    <td>${client.firstName || '—'}</td>
                    <td>${client.birthDate ? formatDate(client.birthDate) : '—'}</td>
                    <td>${client.sex || '—'}</td>
                    <td>${client.zone || '—'}</td>
                    <td>${client.entryDate ? formatDate(client.entryDate) : '—'}</td>
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
                <p>Aucun client dans la base de données</p>
                <button class="btn-primary" onclick="closeClientsStats(); importClients();" style="margin-top: 20px;">
                    Importer des patients
                </button>
            </div>
        `;
    }
    
    content.innerHTML = html;
}

// Fermer le modal (bouton croix)
function closeClientsStats() {
    document.getElementById('clientsStatsPanel').classList.remove('active');
}

// Rendre les fonctions globales
window.showClientsStats = showClientsStats;
window.renderClientsStats = renderClientsStats;
window.closeClientsStats = closeClientsStats;