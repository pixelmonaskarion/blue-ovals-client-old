import './App.css';
import { useEffect, useState, useRef } from 'react';
import Crypto from "./Crypto.js"
import { TextField, IconButton, Send, Icon } from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
const Electron = require("electron");
var protobuf = require("protobufjs");
let protos = await load_protobufs();

function App() {
  const [email, setEmail] = useState("christopher@huntwork.net");

	useEffect(() => {
		(async () => {
			if (await Electron.ipcRenderer.invoke('get-auth') === undefined) {
				let basic_auth_json = {
					email: "christopher@huntwork.net",
					password: "balls",
				};
        setEmail(basic_auth_json.email);
				//check if req failed later but for now it doesn't matter
				// eslint-disable-next-line no-unused-vars
				let create_res = await (await fetch("https://chrissytopher.com:40441/create-account/", {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(basic_auth_json)
				})).json();
				console.log(create_res);
				let keys = await Crypto.generateKeyPair();
				let ids_res = await (await fetch("https://chrissytopher.com:40441/register-ids/", {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						...basic_auth_json,
						public_key: keys.publicKey,
					})
				})).json();
				if (ids_res.success) {
					let uuid = ids_res.uuid;
					let full_auth_json = {
						...basic_auth_json,
						uuid: uuid,
						public_key: keys.publicKey,
						private_key: keys.privateKey,
					};
					await Electron.ipcRenderer.invoke('save-auth', full_auth_json);
					send_message(basic_auth_json.email, new_message("Hello Proto!"));
				} else {
					throw ids_res.error;
				}
			}
			let auth = await Electron.ipcRenderer.invoke('get-auth');
			const ws = new WebSocket('wss://chrissytopher.com:40441/events/' + auth.uuid);
      ws.onclose = () => {
        console.log("ws closing");
      }
			ws.onerror = console.error;

			ws.onopen = async () => {
				console.log("ws started");
				ws.send(auth.email);
				ws.send(auth.password);
				send_message(auth.email, new_message("Hello Proto!"));
        console.log(await Electron.ipcRenderer.invoke('get-all-messages'));
			};

			ws.onmessage = async function message(event) {
        console.log("on message");
				let data = event.data;
				if (data == "😝") return;
				let message_json = JSON.parse(event.data.toString());
				let Message = protos.lookupType("Message");
				let message = Message.decode(await Crypto.decryptBytes(auth.private_key, message_json.data));
				await Electron.ipcRenderer.invoke('save-message', message, message_json.sender);
				console.log(await Electron.ipcRenderer.invoke('get-all-messages'));
			};
		})();
	}, []);

	const [messageList, setMessageList] = useState([]);

	const [fieldValue, setFieldValue] = useState('');

  const messagesEndRef = useRef();

	function handleTextFieldChange(e) {
		setFieldValue(e.target.value);
	}

  Electron.ipcRenderer.invoke('get-all-messages').then(data => {
    setMessageList(afterGetmessages(data));
    //console.log(messageList);
  });

  useEffect(() => {
    if (messageList.length)
    {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }

  }, [messageList.length]);

	
	return (
		<div className='App'>
			<div className='messagesList'>
				{/* Render chat messages here */}
				{messageList.map((message2, i) => (
					<Message message={message2.text} self={(message2.sender == email)}/>
				))}
				{/* Add more message items as needed */}
        <div ref={messagesEndRef} />
			</div>
			<div className='inputContainer'>
				<TextField className='messageInput' label="Type message..." variant="standard" onChange={handleTextFieldChange}/>
				<IconButton onClick={() => handleSend(fieldValue)}>
					<SendIcon/>
				</IconButton>
			</div>
		</div>
	);
}

async function handleSend(message) {
	send_message("christopher@huntwork.net", new_message(message));
}


async function load_protobufs() {
	return new Promise((resolve, reject) => {
		protobuf.load(__dirname + "/../build/message.proto", function (err, root) {
			if (err) {
				reject(err);
			}
			resolve(root);
		});
	})
}

async function send_message(recipient, message) {
	let auth = await Electron.ipcRenderer.invoke('get-auth');
	let ids = await (await fetch("https://chrissytopher.com:40441/query-ids/" + recipient)).json();
	ids.ids.forEach(async device => {
		let Message = protos.lookupType("Message");
		let encrypted_message = await Crypto.encryptBytes(device.public_key, Message.encode(message).finish());
		let res = await fetch("https://chrissytopher.com:40441/post-message/", {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				account: {
					email: auth.email,
					password: auth.password,
				},
				recipient: device.uuid,
				data: encrypted_message,
			})
		});
	});
}

function new_message(text) {
	let Message = protos.lookupType("Message");
	return Message.create({text: text, uuid: window.crypto.randomUUID(), timestamp: ""+Date.now()});
}

function afterGetmessages(messages)
{
  //console.log(messages);
  return messages;
}

const Message = (props) => {
	const message = props.message ? props.message : "no message";
	const self = props.self;

	return (
		<div className={self ? 'selfMessage' : 'otherMessage'}>
			<p>{message}</p>
		</div>
	);
}

export default App;
