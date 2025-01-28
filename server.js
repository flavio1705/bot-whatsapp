const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();
app.use(bodyParser.json());
const db = require('./database');
const { format } = require('date-fns');
const WHATSAPP_TOKEN = 'EAB9qcvuqoZAsBOy46c2t42OdWnvll1CWg2p9anhmptIUyNfcoZCI7jZADwtcqMS3gPgQA3PNDvvAkD8ZAeYrCh70xYfsiIsUv1JQUCZCGMG1Pkhhg2HhqGOJ2ZBlbZCmLobac1nrbeGZCXn6w4YkBX9uwKu1VVe0n7n5CqXa2sa9i5xzwfRUesDsHpPi2x4iCVz2ogZDZD';
const WHATSAPP_API_URL = 'https://graph.facebook.com/v21.0/504674036069189/messages';
const VERIFY_TOKEN = 'likechuckpqrs';
const { BlobServiceClient } = require('@azure/storage-blob');
const AZURE_STORAGE_CONNECTION_STRING = 'DefaultEndpointsProtocol=https;AccountName=likechuckstorage;AccountKey=Xrlb21wryDJfksHoCRSOvp9ZHXVoyQEWug7O14E0LZGeCobb0waoDISJvfKx185Sjc7VMaGcxzLDig/2MW4ciw==;EndpointSuffix=core.windows.net';
const CONTAINER_NAME = 'pqrsdocs';
const conversationState = {};
const { sendFirebaseNotification, subscribeToTopic } = require('');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI('AIzaSyBSKa1kqW0WAF9YmXjSCdf0FEYPft5iPb0');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


// Configuración específica de CORS
const corsOptions = {
    origin: 'http://localhost:3001', // Permitir solo este origen
    methods: ['GET', 'POST'],        // Métodos permitidos
    allowedHeaders: ['Content-Type', 'Authorization'], // Cabeceras permitidas
};
app.use(cors(corsOptions));

// Función para enviar mensaje con botones
const sendButtonMessage = async (to, text, buttons) => {
    try {
        const response = await axios.post(
            WHATSAPP_API_URL,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: text
                    },
                    action: {
                        buttons: buttons
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error al enviar mensaje con botones:', error);
        throw error;
    }
};
const uploadToAzure = async (fileName, buffer, mimeType, pqrsId) => {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);

        // Asegúrate de que el contenedor existe
        const exists = await containerClient.exists();
        if (!exists) {
            await containerClient.create();
        }

        // Crear nombre de archivo con carpeta usando el pqrsId
        const folderPath = `pqrs_${pqrsId}`;
        const fullPath = `${folderPath}/${fileName}`;

        // Subir archivo
        const blockBlobClient = containerClient.getBlockBlobClient(fullPath);
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: mimeType },
        });

        console.log(`Archivo subido a Azure: ${blockBlobClient.url}`);
        return blockBlobClient.url;
    } catch (error) {
        console.error('Error al subir a Azure:', error);
        throw new Error('Error al subir el archivo a Azure Storage');
    }
};

const downloadMedia = async (mediaId, mediaType, pqrsId) => {
    try {
        const mediaInfoUrl = `https://graph.facebook.com/v21.0/${mediaId}`;
        const mediaInfoResponse = await axios.get(mediaInfoUrl, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
        });
        console.log('mediaInfoResponse', mediaInfoResponse.data);

        const mediaUrl = mediaInfoResponse.data.url;
        if (!mediaUrl) {
            throw new Error('No se encontró la URL del archivo multimedia');
        }

        const mediaResponse = await axios.get(mediaUrl, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
            responseType: 'arraybuffer',
        });

        const buffer = mediaResponse.data;
        let fileName, mimeType;

        switch (mediaType) {
            case 'audio':
                fileName = `audio_${Date.now()}.ogg`;
                mimeType = 'audio/ogg';
                break;

            case 'image':
                fileName = `imagen_${Date.now()}.jpg`;
                mimeType = 'image/jpeg';
                break;

            case 'document': {
                const originalFileName = mediaInfoResponse.data.filename;
                const originalMimeType = mediaInfoResponse.data.mime_type;

                // Manejo de extensiones soportadas
                const supportedExtensions = {
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                    'application/vnd.ms-excel': '.xls',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
                    'application/vnd.ms-powerpoint': '.ppt',
                    'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
                    'text/plain': '.txt',
                    'text/csv': '.csv',
                };

                const extension = supportedExtensions[originalMimeType] || '.bin';
                fileName = originalFileName || `documento_${Date.now()}${extension}`;
                mimeType = originalMimeType || 'application/octet-stream';
                break;
            }

            case 'video': {
                const originalFileName = mediaInfoResponse.data.filename || `video_${Date.now()}.mp4`;
                fileName = originalFileName;
                mimeType = mediaInfoResponse.data.mime_type || 'video/mp4';
                break;
            }

            default:
                throw new Error('Tipo de medio no soportado');
        }

        const azureUrl = await uploadToAzure(fileName, buffer, mimeType, pqrsId);
        return azureUrl;
    } catch (error) {
        console.error('Error al descargar el medio:', error);
        throw new Error('Error al descargar el archivo multimedia');
    }
};

function replaceStart(s) {
    const number = s.slice(3);
    if (s.startsWith("521")) {
        return "52" + number;
    } else if (s.startsWith("549")) {
        return "54" + number;
    } else {
        return s;
    }
}
const generateTrackingNumber = (id) => {
    const now = new Date();
    const datePart = format(now, 'yyyyMMdd'); // YYYYMMDD
    const timePart = format(now, 'HHmmss'); // HHMMSS
    return `PQRS-${datePart}-${timePart}-${id}`;
};
const formatDate = (date) => {
    return format(date, 'dd/MM/yyyy'); // Formatea como DD/MM/YYYY
};
const sendMessage = async (to, message) => {
    to = '+' + to;
    try {
        await axios.post(
            WHATSAPP_API_URL,
            {
                messaging_product: 'whatsapp',
                to,
                text: { body: message }
            },
            {
                headers: {
                    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        console.log(`Mensaje enviado a ${to}: ${message}`);
    } catch (error) {
        console.error('Error al enviar el mensaje:', error.response?.data || error.message);
    }
};
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403); // No autorizado
    }
});


// Función para enviar mensaje con botones incluyendo opción de volver
const sendButtonMessageWithBack = async (to, text, buttons, showBack = true) => {
    try {
        if (showBack) {
            buttons.push({
                type: "reply",
                reply: {
                    id: "go_back",
                    title: "↩️ Volver"
                }
            });
        }

        const response = await axios.post(
            WHATSAPP_API_URL,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: to,
                type: "interactive",
                interactive: {
                    type: "button",
                    body: {
                        text: text
                    },
                    action: {
                        buttons: buttons
                    }
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error al enviar mensaje con botones:', error);
        throw error;
    }
};

// Función para manejar el botón de volver
const handleGoBack = async (from, currentState) => {
    const previousStages = {
        'askIdentification': 'selectType',
        'getName': 'askIdentification',
        'getSubject': () => currentState.identification === 'Anónimo' ? 'askIdentification' : 'getName',
        'addDetails': 'getSubject',
        'askForMore': 'addDetails'
    };

    const getPreviousStage = previousStages[currentState.stage];
    const previousStage = typeof getPreviousStage === 'function' ? getPreviousStage() : getPreviousStage;

    if (previousStage) {
        // Restaurar el estado anterior
        conversationState[from].stage = previousStage;

        // Enviar el mensaje correspondiente al estado anterior
        switch (previousStage) {
            case 'selectType':
                const menuMessage = `👋 Por favor selecciona el tipo de solicitud que deseas realizar:  

1️⃣ Petición 
📄 Solicita información o servicios.  

2️⃣ Queja  
😡 Reporta inconformidades en el servicio.  

3️⃣ Reclamo  
📢 Informa sobre un incumplimiento.  

4️⃣ Sugerencia  
💡 Comparte tus ideas para mejorar.  

5️⃣ Consultar Estado  
🔍 Consulta el estado de un PQRS mediante el número de seguimiento.

Responde con el número de tu elección (ejemplo: 1).`;
                await sendMessage(from, menuMessage);
                break;

            case 'askIdentification':
                const identificationMessage = `Has seleccionado: ${conversationState[from].type}
¿Cómo deseas identificarte?
1️⃣ Con nombre y apellido
2️⃣ Anónimo`;
                await sendButtonMessageWithBack(
                    from,
                    identificationMessage,
                    [
                        {
                            type: "reply",
                            reply: {
                                id: "identify_name",
                                title: "Con nombre"
                            }
                        },
                        {
                            type: "reply",
                            reply: {
                                id: "identify_anonymous",
                                title: "Anónimo"
                            }
                        }
                    ]
                );
                break;

            case 'getName':
                await sendButtonMessageWithBack(from, 'Por favor, escribe tu nombre y apellido:', [], true);
                break;

            case 'getSubject':
                await sendButtonMessageWithBack(from, 'Por favor, escribe el título o asunto de tu PQRS:', [], true);
                break;

            case 'addDetails':
                const msg = `✅ ¡Perfecto! Por favor, describe el problema con el mayor detalle posible.  
Ejemplo: "El pedido que hice no llegó a tiempo y estaba incompleto."`;
                await sendButtonMessageWithBack(from, msg, [], true);
                break;
        }
    }
};


app.post('/webhook', async (req, res) => {
    try {
        console.log('Mensaje recibido:', req.body);
        const body = req.body;
        if (body.object !== 'whatsapp_business_account') {
            res.sendStatus(404);
            return;
        }
        for (const entry of body.entry) {
            for (const change of entry.changes) {
                const message = change.value.messages && change.value.messages[0];
                if (message) {
                    let from = message.from;
                    from = replaceStart(from);
                    console.log('message', message);
                    let  text = message.text?.body ?? message.text;
                    // Manejar el botón de volver si se presiona
                    if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                        const buttonId = message.interactive.button_reply.id;
                        if (buttonId === 'go_back') {
                            await handleGoBack(from, conversationState[from]);
                            res.sendStatus(200);
                            continue;
                        }
                    }
                    if (!conversationState[from]) {
                        conversationState[from] = { stage: 'selectType' };
                        const menuMessage = `👋 Por favor selecciona el tipo de solicitud que deseas realizar:  
        
        1️⃣ Petición 
        📄 Solicita información o servicios.  
        
        2️⃣ Queja  
        😡 Reporta inconformidades en el servicio.  
        
        3️⃣ Reclamo  
        📢 Informa sobre un incumplimiento.  
        
        4️⃣ Sugerencia  
        💡 Comparte tus ideas para mejorar.  
        
        5️⃣ Consultar Estado  
        🔍 Consulta el estado de un PQRS mediante el número de seguimiento.
        
        Responde con el número de tu elección (ejemplo: 1).`;
                        await sendMessage(from, menuMessage);
                    }
                    else if (conversationState[from].stage === 'selectType') {
                        let pqrsType;
                        switch (text) {
                            case '1':
                                pqrsType = 'Petición';
                                break;
                            case '2':
                                pqrsType = 'Queja';
                                break;
                            case '3':
                                pqrsType = 'Reclamo';
                                break;
                            case '4':
                                pqrsType = 'Sugerencia';
                                break;
                            case '5':
                                conversationState[from].stage = 'statusCheck';
                                await sendButtonMessageWithBack(from, 'Por favor, ingresa tu número de seguimiento:', [], true);
                                return;
                            default:
                                await sendMessage(from, 'Por favor selecciona una opción válida (1, 2, 3, 4 o 5).');
                                return;
                        }
                        conversationState[from] = {
                            stage: 'askIdentification',
                            type: pqrsType
                        };
                        const identificationMessage = `Has seleccionado: ${pqrsType}
        ¿Cómo deseas identificarte?
        1️⃣ Con nombre y apellido
        2️⃣ Anónimo
        Responde con el número de tu elección (1 o 2).`;
                        await sendButtonMessageWithBack(
                            from,
                            identificationMessage,
                            [
                                {
                                    type: "reply",
                                    reply: {
                                        id: "identify_name",
                                        title: "Con nombre"
                                    }
                                },
                                {
                                    type: "reply",
                                    reply: {
                                        id: "identify_anonymous",
                                        title: "Anónimo"
                                    }
                                }
                            ]
                        );
                    }
                    else if (conversationState[from].stage === 'askIdentification') {
                        if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply.id;
                            if (buttonId === 'identify_name') {
                                conversationState[from].stage = 'getName';
                                await sendButtonMessageWithBack(from, 'Por favor, escribe tu nombre y apellido:', [], true);
                            } else if (buttonId === 'identify_anonymous') {
                                conversationState[from].identification = 'Anónimo';
                                conversationState[from].stage = 'getSubject';
                                await sendButtonMessageWithBack(from, 'Por favor, escribe el título o asunto de tu PQRS:', [], true);
                            }
                        } else {
                            await sendMessage(from, 'Por favor usa los botones para seleccionar una opción.');
                        }
                    }
                    else if (conversationState[from].stage === 'getName') {
                        conversationState[from].identification = text;
                        conversationState[from].stage = 'getSubject';
                        await sendButtonMessageWithBack(from, 'Por favor, escribe el título o asunto de tu PQRS:', [], true);
                    }
                    else if (conversationState[from].stage === 'getSubject') {
                        conversationState[from].subject = text;
                        conversationState[from].stage = 'addDetails';
                        const msg = `✅ ¡Perfecto! Por favor, describe el problema con el mayor detalle posible.  
        Ejemplo: "El pedido que hice no llegó a tiempo y estaba incompleto."`;
                        await sendButtonMessageWithBack(from, msg, [], true);
                    }
                    else if (conversationState[from].stage === 'addDetails') {
                        const pqrsType = conversationState[from].type;
                        if (!conversationState[from].attachments) {
                            conversationState[from].attachments = [];
                        }
                        try {
                            if (message.type === 'location') {
                                conversationState[from].location = {
                                    latitude: message.location.latitude,
                                    longitude: message.location.longitude,
                                    address: message.location.address || 'Sin dirección específica'
                                };
                                await sendButtonMessageWithBack(
                                    from,
                                    "✅ Ubicación recibida. ¿Deseas agregar más detalles a tu PQRS?",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_no",
                                                title: "No, finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'askForMore';
                            } else if (['audio', 'image', 'document', 'video'].includes(message.type)) {
                                const mediaId = message[message.type].id;
                                const caption = message[message.type].caption || '';
                                conversationState[from].attachments.push({
                                    type: message.type,
                                    mediaId: mediaId,
                                    caption: caption
                                });
                                await sendButtonMessageWithBack(
                                    from,
                                    "¿Deseas agregar más detalles a tu PQRS? Pueden ser texto, imágenes, audio o documentos.",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_no",
                                                title: "No, finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'askForMore';
                            } else if (message.type === 'text') {
                                conversationState[from].attachments.push({
                                    type: 'text',
                                    content: message.text.body
                                });
                                await sendButtonMessageWithBack(
                                    from,
                                    "¿Deseas agregar más detalles a tu PQRS? Pueden ser texto, imágenes, audio o documentos.",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_no",
                                                title: "No, finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'askForMore';
                            }
                        } catch (error) {
                            console.error('Error en el procesamiento:', error);
                            await sendMessage(from, 'Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
                        }
                    } else if (conversationState[from].stage === 'askForMore') {
                        if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply.id;
                            if (buttonId === 'add_more_yes') {
                                conversationState[from].stage = 'addDetails';
                                await sendButtonMessageWithBack(from, 'Por favor, envía el contenido adicional (texto, imagen, audio, documento o ubicación):', [], true);
                            } else if (buttonId === 'add_more_no') {
                                await processFinalPQRS(from, conversationState[from]);
                            }
                        }
                    } else if (conversationState[from].stage === 'statusCheck') {
                        if (text === "5") {
                            res.sendStatus(200)
                            return
                        }
                        const trackingNumber = text.trim().toUpperCase();
                        db.get(
                            `SELECT ph.status, p.type, p.details, ph.changed_at, p.id,p.is_anonymous,
                                        p.identifier,
                                        p.subject FROM pqrs p 
                                     JOIN pqrs_history ph ON p.id = ph.pqrs_id 
                                     WHERE p.tracking_number = ? 
                                     ORDER BY ph.changed_at DESC 
                                     LIMIT 1`,
                            [trackingNumber],
                            async (err, row) => {
                                if (err) {
                                    console.error('Error al buscar el estado del PQRS:', err.message);
                                    await sendMessage(from, 'Error al buscar el estado. Por favor intenta nuevamente más tarde.');
                                } else if (row) {
                                    await sendMessage(
                                        from,
                                        `🔍 *Estado de tu PQRS:*\n\n` +
                                        `🔑 Número de seguimiento: *${trackingNumber}*\n` +
                                        `👤 Identificación: *${row.is_anonymous ? 'Anónimo' : row.identifier}*\n` +
                                        `📝 Asunto: *${row.subject}*\n` +
                                        `📄 Tipo: *${row.type}*\n` +
                                        `🕒 Fecha: *${formatDate(new Date(row.changed_at))}*\n` +
                                        `📋 Detalles: \n${row.details ? row.details : 'Sin detalles'}\n` +
                                        `📌 Estado actual: *${row.status}*`
                                    );
                                    if (row.status === 'Pendiente') {
                                        conversationState[from] = {
                                            stage: 'askMoreInfoStatus',
                                            pqrsId: row.id,
                                            type: row.type,
                                            trackingNumber: trackingNumber
                                        };
                                        await sendButtonMessage(
                                            from,
                                            "¿Deseas agregar más información a este PQRS?",
                                            [
                                                {
                                                    type: "reply",
                                                    reply: {
                                                        id: "add_status_yes",
                                                        title: "Sí, agregar más"
                                                    }
                                                },
                                                {
                                                    type: "reply",
                                                    reply: {
                                                        id: "add_status_no",
                                                        title: "No, gracias"
                                                    }
                                                }
                                            ]
                                        );
                                    } else {
                                        delete conversationState[from];
                                    }
                                } else {
                                    await sendMessage(from, 'No se encontraron registros para el número de seguimiento proporcionado.');
                                    delete conversationState[from];
                                }
                            }
                        );
                    } else if (conversationState[from].stage === 'askMoreInfoStatus') {
                        if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply.id;
                            if (buttonId === 'add_status_yes') {
                                conversationState[from].stage = 'addMoreInfoStatus';
                                conversationState[from].attachments = [];
                                await sendMessage(from, 'Por favor, envía la información adicional (texto, imagen, audio, video, documento o ubicación).');
                            } else if (buttonId === 'add_status_no') {
                                delete conversationState[from];
                                await sendMessage(from, 'Gracias por usar nuestro servicio de PQRS.');
                            }
                        }
                    } 
                    else if (conversationState[from].stage === 'addMoreInfoStatus') {
                        try {
                            if (!conversationState[from].attachments) {
                                conversationState[from].attachments = [];
                            }
                            let newContent = '';
                            if (message.type === 'location') {
                                conversationState[from].location = {
                                    latitude: message.location.latitude,
                                    longitude: message.location.longitude,
                                    address: message.location.address || 'Sin dirección específica'
                                };
                                newContent = `\nUbicación actualizada: ${message.location.address || 'Ubicación compartida'}`;
                                
                                // Agrega los botones de confirmación después de agregar la ubicación
                                await sendButtonMessage(
                                    from,
                                    "¿Deseas agregar más información?",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_no",
                                                title: "Finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'confirmMoreInfo';
                                conversationState[from].newContent = (conversationState[from].newContent || '') + newContent;
                            } else if (['audio', 'image', 'document', 'video'].includes(message.type)) {
                                conversationState[from].attachments.push({
                                    type: message.type,
                                    mediaId: message[message.type].id,
                                    caption: message[message.type].caption || ''
                                });
                                newContent = `\nNuevo archivo ${message.type} agregado${message[message.type].caption ? ': ' + message[message.type].caption : ''}`;
                                
                                // Agrega los botones de confirmación después de agregar el archivo multimedia
                                await sendButtonMessage(
                                    from,
                                    "¿Deseas agregar más información?",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_no",
                                                title: "Finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'confirmMoreInfo';
                                conversationState[from].newContent = (conversationState[from].newContent || '') + newContent;
                            } else if (message.type === 'text') {
                                if (text === "5") {
                                    res.sendStatus(200)
                                    return
                                }
                                conversationState[from].attachments.push({
                                    type: 'text',
                                    content: message.text.body
                                });
                                newContent = `\nInformación adicional: ${message.text.body}`;
                                
                                // Agrega los botones de confirmación después de agregar el texto
                                await sendButtonMessage(
                                    from,
                                    "¿Deseas agregar más información?",
                                    [
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_yes",
                                                title: "Sí, agregar más"
                                            }
                                        },
                                        {
                                            type: "reply",
                                            reply: {
                                                id: "add_more_status_no",
                                                title: "Finalizar"
                                            }
                                        }
                                    ]
                                );
                                conversationState[from].stage = 'confirmMoreInfo';
                                conversationState[from].newContent = (conversationState[from].newContent || '') + newContent;
                            }
                        } catch (error) {
                            console.error('Error al procesar información adicional:', error);
                            await sendMessage(from, 'Hubo un error al procesar tu información. Por favor, intenta nuevamente más tarde.');
                        }
                    }

                    else if (conversationState[from].stage === 'confirmMoreInfo') {
                        if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                            const buttonId = message.interactive.button_reply.id;
                            if (buttonId === 'add_more_status_yes') {
                                conversationState[from].stage = 'addMoreInfoStatus';
                                await sendMessage(from, 'Por favor, envía la información adicional.');
                            } else if (buttonId === 'add_more_status_no') {
                                await updatePQRSWithAdditionalInfo(from, conversationState[from]);
                            }
                        }
                    }
                }
            }
        }
        res.sendStatus(200);

    } catch (error) {
        console.error('Error en webhook:', error);
        if (!res.headersSent) {
            res.status(500).send('Error interno del servidor');
        }
    }
});

app.get('/pqrs', (req, res) => {
    db.all(`SELECT * FROM pqrs ORDER BY timestamp DESC`, [], (err, rows) => {
        if (err) {
            console.error('Error al obtener PQRS:', err.message);
            res.status(500).send('Error al obtener PQRS');
        } else {
            res.json(rows);
        }
    });
});

app.get('/pqrs/:id', (req, res) => {
    const id = req.params.id;
    db.get(`SELECT * FROM pqrs WHERE id = ?`, [id], (err, row) => {
        if (err) {
            console.error('Error al obtener PQRS:', err.message);
            res.status(500).send('Error al obtener PQRS');
        } else if (!row) {
            res.status(404).send('PQRS no encontrado');
        } else {
            res.json(row);
        }
    });
});

function processAttachments(attachments) {
    if (!attachments || attachments.length === 0) {
        return {
            textContent: '',
            mediaFiles: []
        };
    }
    let textContent = '';
    const mediaFiles = [];
    attachments.forEach((attachment, index) => {
        if (attachment.type === 'text') {
            textContent += (textContent ? '\n\n' : '') + attachment.content;
        } else if (['audio', 'image', 'document', 'video'].includes(attachment.type)) {
            mediaFiles.push({
                type: attachment.type,
                mediaId: attachment.mediaId,
                caption: attachment.caption || '',
                index: index
            });
        }
    });

    return {
        textContent: textContent.trim(),
        mediaFiles: mediaFiles
    };
}

app.post('/subscribe', async (req, res) => {
    const { token } = req.body;

    if (!token) {
        return res.status(400).json({ error: 'Token is required' });
    }

    try {
        const response = await subscribeToTopic(token, 'admin-notifications');
        res.status(200).json({ message: 'Subscribed successfully', response });
    } catch (error) {
        res.status(500).json({ error: 'Failed to subscribe to topic' });
    }
});

app.post('/generate', async (req, res) => {
    const { detail } = req.body;
    if (!detail) {
        return res.status(400).json({ error: 'detail is required' });
    }
    const prompt = `Eres un modelo diseñado para clasificar la severidad de una PQRS (Petición, Queja, Reclamo o Sugerencia) como baja, media o alta en función de la descripción proporcionada. Utiliza los siguientes criterios:
Baja:
La PQRS menciona problemas menores o detalles no críticos.
No afecta significativamente al usuario ni al funcionamiento general del sistema o servicio.
Ejemplo: "El diseño de la página web es confuso."
Media:
La PQRS menciona inconvenientes que afectan la experiencia del usuario o el rendimiento del sistema.
Hay un impacto notable, pero no crítico, en las operaciones o el usuario.
Ejemplo: "El sistema se ralentiza al intentar cargar ciertas funcionalidades."
Alta:
La PQRS menciona fallas críticas que impiden el uso del servicio o tienen un impacto significativo en la seguridad, operación o datos del usuario.
Hay un alto nivel de insatisfacción o riesgo.
Ejemplo: "Los datos personales del cliente fueron expuestos públicamente."
Tarea: Evalúa la descripción proporcionada y clasifícala como baja, media o alta.
Descripción: ${detail}
Respuesta esperada:
Severidad: [Baja/Media/Alta]
Justificación: [Explica brevemente la razón de la clasificación.]`
    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        res.status(200).json({ message: 'Generate successfully', text });
    } catch (error) {
        res.status(500).json({ error: 'Failed to Gemerate' });
    }
});

async function processFinalPQRS(from, state) {
    try {
        let textDetails = [];
        let processedAttachments = [];
        db.run(
            `INSERT INTO pqrs (
                type, 
                details, 
                attachments,
                location,
                phone_number,
                is_anonymous,
                identifier,
                subject,
                created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [
                state.type,
                'Sin detalles',
                JSON.stringify([]), // Solo archivos multimedia
                state.location ? JSON.stringify(state.location) : null,
                from,
                state.identification === 'Anónimo' ? 1 : 0,
                state.identification,
                state.subject
            ],
            async function (err) {
                if (err) {
                    console.error('Error al guardar PQRS:', err.message);
                    await sendMessage(from, 'Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
                    return;
                }

                const pqrsId = this.lastID;
                const trackingNumber = generateTrackingNumber(pqrsId);
                // Combinar todos los detalles en un solo texto
                // Procesar todos los attachments y construir los detalles
                for (const attachment of state.attachments) {
                    if (attachment.type === 'text') {
                        textDetails.push(attachment.content);
                    } else {
                        try {
                            const mediaUrl = await downloadMedia(attachment.mediaId, attachment.type, pqrsId);
                            processedAttachments.push({
                                type: attachment.type,
                                mediaId: attachment.mediaId,
                                caption: attachment.caption || '',
                                url: mediaUrl
                            });
                            // Si hay caption, agregarlo a los detalles con referencia al tipo de archivo
                            if (attachment.caption) {
                                let emoji = "";
                                switch (attachment.type) {
                                    case 'document':
                                        emoji = '📄'; // Emoji de documento
                                        break;
                                    case 'audio':
                                        emoji = '🎵'; // Emoji de audio
                                        break;
                                    case 'video':
                                        emoji = '🎥'; // Emoji de video
                                        break;
                                    case 'image':
                                        emoji = '🖼️'; // Emoji de imagen
                                        break;
                                    default:
                                        emoji = '❓'; // Emoji por defecto
                                        break;
                                }
                                textDetails.push(`${emoji} ${attachment.caption}`);
                            }
                        } catch (error) {
                            console.error('Error al procesar archivo multimedia:', error);
                        }
                    }
                }
                const finalDetails = textDetails.join('\n\n');
                db.run(
                    `UPDATE pqrs SET 
                    tracking_number = ?,
                    details = ?, 
                    attachments = ?
                    WHERE id = ?`,
                    [trackingNumber, finalDetails, JSON.stringify(processedAttachments), pqrsId],
                    async function (err) {
                        if (err) {
                            console.error('Error al actualizar tracking number:', err.message);
                            await sendMessage(from, 'Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
                            return;
                        }

                        db.run(
                            `INSERT INTO pqrs_history (pqrs_id, status, changed_at) 
                             VALUES (?, 'Pendiente', datetime('now'))`,
                            [pqrsId],
                            async function (err) {
                                if (err) {
                                    console.error('Error al crear historial:', err.message);
                                    await sendMessage(from, 'Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
                                    return;
                                }

                                const confirmationMessage =
                                    `✅ Tu ${state.type} ha sido registrada exitosamente.\n\n` +
                                    `🔑 Número de seguimiento: *${trackingNumber}*\n` +
                                    `👤 Identificación: *${state.identification}*\n` +
                                    `📝 Asunto: *${state.subject}*\n` +
                                    `📅 Fecha: *${formatDate(new Date())}*\n\n` +
                                    `Guarda este número para consultar el estado de tu solicitud más adelante.`;

                                await sendMessage(from, confirmationMessage);
                                delete conversationState[from];
                                await sendFirebaseNotification({
                                    id: pqrsId,
                                    type: state.type,
                                    tracking_number: trackingNumber,
                                    is_anonymous: state.identification === 'Anónimo',
                                    identifier: state.identification,
                                    subject: state.subject
                                });
                            }
                        );
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error en processFinalPQRS:', error);
        await sendMessage(from, 'Hubo un error al procesar tu solicitud. Por favor, intenta nuevamente más tarde.');
    }
}

const updatePQRSWithAdditionalInfo = async (from, state) => {
    try {
        return new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                db.get(
                    'SELECT details, attachments FROM pqrs WHERE id = ?',
                    [state.pqrsId],
                    async (err, row) => {
                        if (err) {
                            db.run('ROLLBACK');
                            console.error('Error al obtener detalles actuales:', err);
                            await sendMessage(from, 'Error al actualizar la información. Por favor, intenta nuevamente más tarde.');
                            reject(err);
                            return;
                        }

                        let currentDetails = row.details || '';
                        let currentAttachments = row.attachments ? JSON.parse(row.attachments) : [];
                        let newTextDetails = [];
                        let newProcessedAttachments = [];

                        try {
                            // Procesar nuevos attachments
                            for (const attachment of state.attachments) {
                                if (attachment.type === 'text') {
                                    newTextDetails.push(attachment.content);
                                } else {
                                    const mediaUrl = await downloadMedia(attachment.mediaId, attachment.type, state.pqrsId);
                                    newProcessedAttachments.push({
                                        type: attachment.type,
                                        mediaId: attachment.mediaId,
                                        caption: attachment.caption || '',
                                        url: mediaUrl
                                    });
                                    // Determinar emoji según el tipo de archivo
                                    let emoji = "";
                                    switch (attachment.type) {
                                        case 'document':
                                            emoji = '📄'; // Emoji de documento
                                            break;
                                        case 'audio':
                                            emoji = '🎵'; // Emoji de audio
                                            break;
                                        case 'video':
                                            emoji = '🎥'; // Emoji de video
                                            break;
                                        case 'image':
                                            emoji = '🖼️'; // Emoji de imagen
                                            break;
                                        default:
                                            emoji = '❓'; // Emoji por defecto
                                            break;
                                    }
                                    // Si hay caption, agregarlo a los detalles con referencia al tipo de archivo
                                    if (attachment.caption) {
                                        newTextDetails.push(`${emoji} ${attachment.caption}`);
                                    } else {
                                        newTextDetails.push(`${emoji} Se agregó un archivo`);
                                    }
                                }
                            }

                            const allAttachments = [...currentAttachments, ...newProcessedAttachments];
                            const newDetails = currentDetails +
                                '\n\n📅 Actualización ' + formatDate(new Date()) + ':\n' +
                                newTextDetails.join('\n\n');

                            db.run(
                                `UPDATE pqrs SET 
                                details = ?, 
                                attachments = ?,
                                location = ?,
                                updated_at = datetime('now')
                                WHERE id = ?`,
                                [
                                    newDetails,
                                    JSON.stringify(allAttachments),
                                    state.location ? JSON.stringify(state.location) : null,
                                    state.pqrsId
                                ],
                                async (updateErr) => {
                                    if (updateErr) {
                                        db.run('ROLLBACK');
                                        console.error('Error al actualizar PQRS:', updateErr);
                                        await sendMessage(from, 'Error al actualizar la información. Por favor, intenta nuevamente más tarde.');
                                        reject(updateErr);
                                        return;
                                    }

                                    db.run(
                                        `INSERT INTO pqrs_history (
                                            pqrs_id,
                                            status,
                                            details,
                                            attachments,
                                            location,
                                            changed_by,
                                            change_type,
                                            changed_at
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                                        [
                                            state.pqrsId,
                                            'Pendiente',
                                            newDetails,
                                            JSON.stringify(newProcessedAttachments),
                                            state.location ? JSON.stringify(state.location) : null,
                                            from,
                                            'Información Adicional',
                                        ],
                                        async (historyErr) => {
                                            if (historyErr) {
                                                db.run('ROLLBACK');
                                                console.error('Error al crear registro histórico:', historyErr);
                                                await sendMessage(from, 'Error al actualizar la información. Por favor, intenta nuevamente más tarde.');
                                                reject(historyErr);
                                                return;
                                            }

                                            db.run('COMMIT');

                                            let confirmationMessage =
                                                `✅ *Información actualizada exitosamente*\n\n` +
                                                `🔑 Número de seguimiento: *${state.trackingNumber}*\n`;

                                            if (newProcessedAttachments.length > 0) {
                                                const mediaCount = newProcessedAttachments.length;
                                                confirmationMessage += `📎 Nuevos archivos adjuntos: *${mediaCount}*\n`;
                                            }

                                            confirmationMessage +=
                                                `📄 Nueva información agregada:\n${newTextDetails.join('\n')}\n\n` +
                                                `Gracias por proporcionar información adicional.`;

                                            await sendMessage(from, confirmationMessage);
                                            delete conversationState[from];
                                            resolve();
                                        }
                                    );
                                }
                            );
                        } catch (error) {
                            db.run('ROLLBACK');
                            console.error('Error al procesar attachments:', error);
                            await sendMessage(from, 'Error al procesar los archivos adjuntos. Por favor, intenta nuevamente más tarde.');
                            reject(error);
                        }
                    }
                );
            });
        });
    } catch (error) {
        console.error('Error al actualizar PQRS:', error);
        await sendMessage(from, 'Hubo un error al actualizar la información. Por favor, intenta nuevamente más tarde.');
        throw error;
    }
};

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});