const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');

// Initialize the client with local authentication
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "groups-fetcher"
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Generate QR code for authentication
client.on('qr', (qr) => {
    console.log('QR Code received, scan with your phone:');
    qrcode.generate(qr, { small: true });
});

// Client is ready
client.on('ready', async () => {
    console.log('Client is ready!');
    console.log('Fetching all chats... (this may take a while)\n');
    
    try {
        // Start timer
        const startTime = Date.now();
        
        // Get all chats with progress indicator
        console.log('Loading chats from WhatsApp Web...');
        const chats = await client.getChats();
        console.log(`✓ Loaded ${chats.length} total chats in ${((Date.now() - startTime) / 1000).toFixed(1)} seconds\n`);
        
        // Filter only group chats
        console.log('Filtering groups...');
        const groups = chats.filter(chat => chat.isGroup);
        
        console.log(`✓ Found ${groups.length} groups\n`);
        
        // Get current user ID
        const myId = client.info.wid._serialized;
        console.log(`Your WhatsApp ID: ${myId}\n`);
        
        // Filter groups where user is admin
        console.log('Finding groups where you are admin...');
        const adminGroups = [];
        
        for (const group of groups) {
            const participant = group.participants.find(p => p && p.id && p.id._serialized === myId);
            if (participant && participant.isAdmin) {
                adminGroups.push(group);
            }
        }
        
        console.log(`✓ Found ${adminGroups.length} groups where you are admin\n`);
        console.log('Processing admin groups and fetching invite links...\n');
        
        // Create arrays to store group information
        const groupsInfo = [];
        const csvData = [];
        
        // Add CSV header
        csvData.push([
            'Group Name',
            'Group ID',
            'Created Date',
            'Owner',
            'Description',
            'Total Participants',
            'Admin Count',
            'Invite Link',
            'Is Archived',
            'Is Muted',
            'Is Pinned',
            'Unread Count',
            'Participant Numbers'
        ].join(','));
        
        // Process each admin group
        for (let i = 0; i < adminGroups.length; i++) {
            const group = adminGroups[i];
            
            console.log(`Processing group ${i + 1}/${adminGroups.length}: ${group.name || 'Unnamed Group'}`);
            
            // Get invite link
            let inviteLink = 'Not available';
            try {
                const inviteCode = await group.getInviteCode();
                inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
                console.log(`  ✓ Got invite link`);
            } catch (error) {
                console.log(`  ✗ Could not get invite link: ${error.message}`);
            }
            
            // Get participant details
            const participants = group.participants
                .filter(p => p && p.id)
                .map(p => ({
                    id: p.id._serialized,
                    number: p.id.user,
                    isAdmin: p.isAdmin || false,
                    isSuperAdmin: p.isSuperAdmin || false
                }));
            
            const adminCount = participants.filter(p => p.isAdmin).length;
            const participantNumbers = participants.map(p => p.number).join('; ');
            
            const groupData = {
                id: group.id._serialized,
                name: group.name || 'Unnamed Group',
                createdAt: group.groupMetadata.creation ? new Date(group.groupMetadata.creation * 1000).toLocaleString() : 'Unknown',
                owner: group.owner ? group.owner._serialized : 'Unknown',
                description: group.description || 'No description',
                participantsCount: participants.length,
                adminCount: adminCount,
                inviteLink: inviteLink,
                participants: participants,
                isArchived: group.archived || false,
                isMuted: group.isMuted || false,
                isPinned: group.pinned || false,
                unreadCount: group.unreadCount || 0
            };
            
            groupsInfo.push(groupData);
            
            // Prepare CSV row with null checks
            const safeName = (group.name || 'Unnamed Group').replace(/"/g, '""');
            const safeDescription = groupData.description.replace(/"/g, '""').replace(/\n/g, ' ');
            
            const csvRow = [
                `"${safeName}"`, // Escape quotes in group name
                group.id._serialized,
                groupData.createdAt,
                groupData.owner,
                `"${safeDescription}"`, // Escape quotes and newlines
                groupData.participantsCount,
                adminCount,
                inviteLink,
                groupData.isArchived ? 'Yes' : 'No',
                groupData.isMuted ? 'Yes' : 'No',
                groupData.isPinned ? 'Yes' : 'No',
                groupData.unreadCount,
                `"${participantNumbers}"` // Wrap in quotes due to semicolons
            ].join(',');
            
            csvData.push(csvRow);
            
            // Display group information
            console.log(`  Name: ${group.name || 'Unnamed Group'}`);
            console.log(`  ID: ${group.id._serialized}`);
            console.log(`  Participants: ${groupData.participantsCount} (${adminCount} admins)`);
            console.log(`  Invite Link: ${inviteLink}`);
            console.log('-----------------------------------\n');
        }
        
        // Save to JSON file
        const jsonFileName = `whatsapp_admin_groups_${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(jsonFileName, JSON.stringify(groupsInfo, null, 2));
        console.log(`✓ Detailed groups information saved to ${jsonFileName}`);
        
        // Save to CSV file
        const csvFileName = `whatsapp_admin_groups_${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(csvFileName, csvData.join('\n'));
        console.log(`✓ Groups CSV saved to ${csvFileName}`);
        
        // Display summary
        console.log('\n=== SUMMARY ===');
        console.log(`Total Groups: ${groups.length}`);
        console.log(`Groups where you are admin: ${adminGroups.length}`);
        console.log(`Successfully fetched invite links: ${groupsInfo.filter(g => g.inviteLink !== 'Not available').length}`);
        console.log(`Total participants across admin groups: ${groupsInfo.reduce((sum, g) => sum + g.participantsCount, 0)}`);
        
        // Calculate total time
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\nTotal processing time: ${totalTime} seconds`);
        
        // Create a detailed participants CSV if needed
        const participantsData = ['Group Name,Participant Number,Is Admin,Is Super Admin'];
        for (const group of groupsInfo) {
            for (const participant of group.participants) {
                const safeGroupName = (group.name || 'Unnamed Group').replace(/"/g, '""');
                participantsData.push([
                    `"${safeGroupName}"`,
                    participant.number,
                    participant.isAdmin ? 'Yes' : 'No',
                    participant.isSuperAdmin ? 'Yes' : 'No'
                ].join(','));
            }
        }
        
        const participantsFileName = `whatsapp_admin_groups_participants_${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(participantsFileName, participantsData.join('\n'));
        console.log(`✓ Detailed participants list saved to ${participantsFileName}`);
        
        // Additional step: Filter groups by keywords
        console.log('\n=== FILTERING GROUPS BY KEYWORDS ===');
        const keywords = ['growthschool', 'outskillllllllll', 'buildschool', 'gs', 'webinar', 'workshop', 'ai', 'mastermind', 'mentorship'];
        console.log(`Keywords: ${keywords.join(', ')}\n`);
        
        const filteredGroups = groupsInfo.filter(group => {
            const groupName = (group.name || '').toLowerCase();
            const groupDescription = (group.description || '').toLowerCase();
            
            return keywords.some(keyword => {
                // For 'gs' and 'ai', we check for word boundaries to avoid false matches
                if (keyword === 'gs' || keyword === 'ai') {
                    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                    return regex.test(groupName) || regex.test(groupDescription);
                }
                return groupName.includes(keyword) || groupDescription.includes(keyword);
            });
        });
        
        console.log(`Found ${filteredGroups.length} groups matching keywords\n`);
        
        if (filteredGroups.length > 0) {
            // Create filtered CSV
            const filteredCsvData = [];
            filteredCsvData.push([
                'Group Name',
                'Group ID',
                'Created Date',
                'Owner',
                'Description',
                'Total Participants',
                'Admin Count',
                'Invite Link',
                'Matched Keywords',
                'Is Archived',
                'Is Muted',
                'Is Pinned',
                'Unread Count',
                'Participant Numbers'
            ].join(','));
            
            // Process filtered groups
            filteredGroups.forEach((group, index) => {
                // Find which keywords matched
                const matchedKeywords = keywords.filter(keyword => {
                    const groupName = (group.name || '').toLowerCase();
                    const groupDescription = (group.description || '').toLowerCase();
                    
                    if (keyword === 'gs' || keyword === 'ai') {
                        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                        return regex.test(groupName) || regex.test(groupDescription);
                    }
                    return groupName.includes(keyword) || groupDescription.includes(keyword);
                });
                
                const participantNumbers = group.participants.map(p => p.number).join('; ');
                const safeName = (group.name || 'Unnamed Group').replace(/"/g, '""');
                const safeDescription = (group.description || 'No description').replace(/"/g, '""').replace(/\n/g, ' ');
                
                const csvRow = [
                    `"${safeName}"`,
                    group.id,
                    group.createdAt,
                    group.owner,
                    `"${safeDescription}"`,
                    group.participantsCount,
                    group.adminCount,
                    group.inviteLink,
                    `"${matchedKeywords.join(', ')}"`,
                    group.isArchived ? 'Yes' : 'No',
                    group.isMuted ? 'Yes' : 'No',
                    group.isPinned ? 'Yes' : 'No',
                    group.unreadCount,
                    `"${participantNumbers}"`
                ].join(',');
                
                filteredCsvData.push(csvRow);
                
                // Display filtered group info
                console.log(`${index + 1}. ${group.name}`);
                console.log(`   Matched keywords: ${matchedKeywords.join(', ')}`);
                console.log(`   Participants: ${group.participantsCount}`);
                console.log(`   Invite Link: ${group.inviteLink}`);
                console.log('');
            });
            
            // Save filtered results
            const filteredCsvFileName = `whatsapp_admin_groups_filtered_${new Date().toISOString().split('T')[0]}.csv`;
            fs.writeFileSync(filteredCsvFileName, filteredCsvData.join('\n'));
            console.log(`✓ Filtered groups CSV saved to ${filteredCsvFileName}`);
            
            const filteredJsonFileName = `whatsapp_admin_groups_filtered_${new Date().toISOString().split('T')[0]}.json`;
            fs.writeFileSync(filteredJsonFileName, JSON.stringify(filteredGroups, null, 2));
            console.log(`✓ Filtered groups JSON saved to ${filteredJsonFileName}`);
            
            // Create filtered participants CSV
            const filteredParticipantsData = ['Group Name,Participant Number,Is Admin,Is Super Admin'];
            for (const group of filteredGroups) {
                for (const participant of group.participants) {
                    const safeGroupName = (group.name || 'Unnamed Group').replace(/"/g, '""');
                    filteredParticipantsData.push([
                        `"${safeGroupName}"`,
                        participant.number,
                        participant.isAdmin ? 'Yes' : 'No',
                        participant.isSuperAdmin ? 'Yes' : 'No'
                    ].join(','));
                }
            }
            
            const filteredParticipantsFileName = `whatsapp_admin_groups_filtered_participants_${new Date().toISOString().split('T')[0]}.csv`;
            fs.writeFileSync(filteredParticipantsFileName, filteredParticipantsData.join('\n'));
            console.log(`✓ Filtered participants list saved to ${filteredParticipantsFileName}`);
            
            // Automatically add default participants to filtered groups
            console.log('\n=== ADDING DEFAULT PARTICIPANTS TO FILTERED GROUPS ===');
            const defaultPhoneNumbers = ['916360706166', '917411207260', '916366966332'];
            console.log(`Adding ${defaultPhoneNumbers.length} default participants to ${filteredGroups.length} groups...\n`);
            
            const allResults = [];
            
            // Process each phone number
            for (const phoneNumber of defaultPhoneNumbers) {
                const participantId = phoneNumber + '@c.us';
                console.log(`\n--- Processing participant: ${phoneNumber} ---\n`);
                
                for (let i = 0; i < filteredGroups.length; i++) {
                    const groupInfo = filteredGroups[i];
                    console.log(`Group ${i + 1}/${filteredGroups.length}: ${groupInfo.name}`);
                    
                    try {
                        // Find the actual group object
                        const group = adminGroups.find(g => g.id._serialized === groupInfo.id);
                        
                        if (group) {
                            // Refresh participants list to ensure we have the latest data
                            try {
                                await group.getChat();
                            } catch (e) {
                                // Continue even if refresh fails
                            }
                            
                            // Check if participant is already in the group
                            const existingParticipant = group.participants.find(p => p && p.id && p.id._serialized === participantId);
                            
                            if (existingParticipant) {
                                // If already a member but not admin, promote them
                                if (!existingParticipant.isAdmin) {
                                    try {
                                        await group.promoteParticipants([participantId]);
                                        console.log(`  ✓ ${phoneNumber}: Promoted to admin`);
                                        allResults.push({
                                            phoneNumber,
                                            group: groupInfo.name,
                                            status: 'Promoted to admin',
                                            success: true
                                        });
                                    } catch (promoteError) {
                                        // Check if error is because user is already admin
                                        if (promoteError.message && promoteError.message.includes('admin')) {
                                            console.log(`  ⚠ ${phoneNumber}: Already an admin`);
                                            allResults.push({
                                                phoneNumber,
                                                group: groupInfo.name,
                                                status: 'Already an admin',
                                                success: true
                                            });
                                        } else {
                                            console.log(`  ⚠ ${phoneNumber}: Could not promote (${promoteError.message || 'Unknown error'})`);
                                            allResults.push({
                                                phoneNumber,
                                                group: groupInfo.name,
                                                status: `Promote failed: ${promoteError.message || 'Unknown error'}`,
                                                success: false
                                            });
                                        }
                                    }
                                } else {
                                    console.log(`  ⚠ ${phoneNumber}: Already an admin`);
                                    allResults.push({
                                        phoneNumber,
                                        group: groupInfo.name,
                                        status: 'Already an admin',
                                        success: true
                                    });
                                }
                            } else {
                                // Add participant to group
                                try {
                                    const result = await group.addParticipants([participantId]);
                                    
                                    if (result && result[participantId]) {
                                        if (result[participantId].code === 200) {
                                            console.log(`  ✓ ${phoneNumber}: Added successfully`);
                                            
                                            // Wait a bit before promoting to admin
                                            await new Promise(resolve => setTimeout(resolve, 1500));
                                            
                                            // Promote to admin
                                            try {
                                                await group.promoteParticipants([participantId]);
                                                console.log(`  ✓ ${phoneNumber}: Promoted to admin`);
                                                allResults.push({
                                                    phoneNumber,
                                                    group: groupInfo.name,
                                                    status: 'Added and promoted to admin',
                                                    success: true
                                                });
                                            } catch (promoteError) {
                                                console.log(`  ⚠ ${phoneNumber}: Added but could not promote`);
                                                allResults.push({
                                                    phoneNumber,
                                                    group: groupInfo.name,
                                                    status: 'Added but not promoted',
                                                    success: true
                                                });
                                            }
                                        } else if (result[participantId].code === 409) {
                                            // Already in group
                                            console.log(`  ⚠ ${phoneNumber}: Already a member`);
                                            allResults.push({
                                                phoneNumber,
                                                group: groupInfo.name,
                                                status: 'Already a member',
                                                success: true
                                            });
                                        } else {
                                            const errorMsg = result[participantId].message || `Error code: ${result[participantId].code}`;
                                            console.log(`  ⚠ ${phoneNumber}: ${errorMsg}`);
                                            allResults.push({
                                                phoneNumber,
                                                group: groupInfo.name,
                                                status: errorMsg,
                                                success: false
                                            });
                                        }
                                    } else {
                                        console.log(`  ⚠ ${phoneNumber}: No response from add operation`);
                                        allResults.push({
                                            phoneNumber,
                                            group: groupInfo.name,
                                            status: 'No response from add operation',
                                            success: false
                                        });
                                    }
                                } catch (addError) {
                                    console.log(`  ⚠ ${phoneNumber}: ${addError.message || 'Unknown error'}`);
                                    allResults.push({
                                        phoneNumber,
                                        group: groupInfo.name,
                                        status: addError.message || 'Unknown error',
                                        success: false
                                    });
                                }
                            }
                        } else {
                            console.log(`  ✗ Could not find group object`);
                            allResults.push({
                                phoneNumber,
                                group: groupInfo.name,
                                status: 'Group object not found',
                                success: false
                            });
                        }
                        
                        // Add delay between groups to avoid rate limiting
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                    } catch (error) {
                        console.log(`  ✗ Unexpected error: ${error.message || 'Unknown error'}`);
                        allResults.push({
                            phoneNumber,
                            group: groupInfo.name,
                            status: `Unexpected error: ${error.message || 'Unknown error'}`,
                            success: false
                        });
                    }
                }
                
                // Add delay between different phone numbers
                if (defaultPhoneNumbers.indexOf(phoneNumber) < defaultPhoneNumbers.length - 1) {
                    console.log(`\nWaiting before processing next participant...`);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            // Save results to file
            const resultsData = ['Phone Number,Group Name,Status,Success'];
            allResults.forEach(result => {
                resultsData.push([
                    result.phoneNumber,
                    `"${result.group.replace(/"/g, '""')}"`,
                    `"${result.status.replace(/"/g, '""')}"`,
                    result.success ? 'Yes' : 'No'
                ].join(','));
            });
            
            const resultsFileName = `whatsapp_add_participants_results_${new Date().toISOString().split('T')[0]}.csv`;
            fs.writeFileSync(resultsFileName, resultsData.join('\n'));
            
            // Display summary
            console.log('\n=== ADD PARTICIPANTS SUMMARY ===');
            console.log(`Total operations: ${allResults.length}`);
            console.log(`Successful: ${allResults.filter(r => r.success).length}`);
            console.log(`Failed: ${allResults.filter(r => !r.success).length}`);
            
            // Summary by phone number
            console.log('\nSummary by participant:');
            for (const phoneNumber of defaultPhoneNumbers) {
                const phoneResults = allResults.filter(r => r.phoneNumber === phoneNumber);
                const successCount = phoneResults.filter(r => r.success).length;
                console.log(`  ${phoneNumber}: ${successCount}/${phoneResults.length} successful`);
            }
            
            console.log(`\nDetailed results saved to ${resultsFileName}`);
        } else {
            console.log('No groups found matching the specified keywords.');
        }
        
    } catch (error) {
        console.error('Error fetching groups:', error);
    }
});

// Handle authentication failure
client.on('auth_failure', msg => {
    console.error('Authentication failed:', msg);
});

// Handle disconnection
client.on('disconnected', (reason) => {
    console.log('Client was disconnected:', reason);
});

// Initialize the client
console.log('Initializing WhatsApp client...');
console.log('This script will fetch all groups where you are an admin.\n');
client.initialize();

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await client.destroy();
    process.exit(0);
});