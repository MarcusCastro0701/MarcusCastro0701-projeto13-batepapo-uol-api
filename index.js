import cors from "cors";
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi"
import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js';

dayjs.extend(customParseFormat);

//Schemas
const partSchema = joi.object({
    name: joi.string().required().min(1)
});

const pattern = "/^[m][e][s][s][a][g][e]|[p][r][i][v][a][t][e][_][m][e][s][s][a][g][e]$/"
const msgSchema = joi.object({
    to: joi.string().required().min(1),
    text: joi.string().required(),
    type: joi.string().regex(/^[m][e][s][s][a][g][e]|[p][r][i][v][a][t][e][_][m][e][s][s][a][g][e]$/).required()
});
//


//Configs
const app = express();
dotenv.config();
app.use(cors());
app.use(express.json());
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
let nomeUsuario;
//


await mongoClient.connect()
db = mongoClient.db("bancoUol");

app.post("/participants", async(req, res) => {
    

    const bodyReq = {
        name: req.body.name
    }

    let today = dayjs().locale('pt-br').format('HH/mm/ss')

    const validation = partSchema.validate(bodyReq, { abortEarly: true });

    if(validation.error){
        const errors = validation.error.details.map(details => details.message)
        console.log(errors)
        res.sendStatus(422)
        return;
    }

    const promise = await db.collection("participantes").find(bodyReq).toArray();
    

    if(promise.length !== 0){
        console.log("ESTE USUÁRIO JÁ EXISTE!", bodyReq);
        res.sendStatus(409);
        return;
    }
    
    const partBody = {
        name: req.body.name,
        lastStatus: Date.now()
    }

    const msgBody = {
        from: req.body.name,
        to: 'Todos', 
        text: 'entra na sala...', 
        type: 'status', 
        time: today}
    
    try {

        const participantes = db.collection("participantes");
        const mensagens = db.collection("mensagens"); 
        await participantes.insertOne(partBody);
        await mensagens.insertOne(msgBody)
        
        
        res.sendStatus(201)
        

    } catch (error) {
        res.send(error)
    }
})

app.get("/participants", async (req, res) => {

    try {
        const objCollection = db.collection("participantes");
        const obj = await objCollection.find().toArray();
        
        res.send(obj)
    }

    catch (error) {
        res.status(500).send('Houve um erro!')
    }

});  

app.post("/messages", async (req, res) => {
    
    let today = dayjs().locale('pt-br').format('HH/mm/ss')

    const bodyUser = {
        name: req.headers.user
    }

    const promise = await db.collection("participantes").find(bodyUser).toArray();
    

    if(promise.length === 0){
        console.log("ESTE USUÁRIO NÃO EXISTE!", bodyUser);
        res.sendStatus(409);
        return;
    }
    
    const msgReq = {
        to: req.body.to,
        text: req.body.text,
        type: req.body.type
    }

    const validation = msgSchema.validate(msgReq, { abortEarly: true });

    if(validation.error){
        const errors = validation.error.details.map(details => details.message)
        console.log(errors)
        res.sendStatus(422)
        return;
    }

    const msgBody = {
        from: req.headers.user,
        to: req.body.to,
        text: req.body.text,
        type: req.body.type,
        time: today
        
    }

    try {
        const mensagem = db.collection("mensagens");
        await mensagem.insertOne(msgBody)
        res.sendStatus(201)
        console.log("Mensagem enviada com sucesso!")
    } catch (error) {
        res.sendStatus(500)
    }
})

app.get("/messages", async ( req, res ) => {
    
    let mensagensPermitidas = [];
    const msgEnviadas = db.collection("mensagens");

    const limite = parseInt(req.query.limit);

    function insere(corpo){
        
        const str = 'Todos'
        const strDois = 'message'
        if((corpo.to === str) || (corpo.to === req.headers.user) || (corpo.from === req.headers.user) || (corpo.type === strDois)){
            mensagensPermitidas.push(corpo)
        }
    }

    try {
        const arrMensagens = await msgEnviadas.find().toArray();
        arrMensagens.map(body => insere(body))
        const reverseUm = mensagensPermitidas.reverse();
        const sliced = reverseUm.slice(0, limite);
        const reverseDois = sliced.reverse();
        console.log(reverseDois.length)
        res.send(reverseDois)
    } catch (error) {
        res.sendStatus(500)
    }


})

app.post("/status", async (req, res) =>{

    const usuario = req.headers.user;
    const body = {
        name: usuario
    }
    
    const newBody = {
        name: usuario,
        lastStatus: Date.now()
    }

    try {
        const collectionParticipantes= db.collection("participantes");
        const participante = await collectionParticipantes.find(body).toArray();
        if(participante.length === 0){
            res.sendStatus(404)
            return;
        };
        
        
        const id = participante[0]._id;
    
        
        await collectionParticipantes.updateOne({_id: new ObjectId(id)}, {$set: newBody})
        
        res.sendStatus(200)
    } catch (error) {
        console.log(error)
        res.sendStatus(404)
    }
    


})

let intervalo = async ()=>{

    let today = dayjs().locale('pt-br').format('HH/mm/ss')
    

    let verificaTempo = async(participante) => {

        const saiDeSala = {
            from: participante.name,
            to: 'Todos',
            text: 'Sai de sala...',
            type: 'status',
            time: today
        }

        const id = participante._id
        const round = Math.floor(participante.lastStatus/1000);
        const now = Math.floor(Date.now()/1000)
        if(now - round > 10){
            await collectionParticipantes.deleteOne({ _id: ObjectId(id) });
            const collectionMensagens = db.collection("mensagens");
            await collectionMensagens.insertOne(saiDeSala);

        }

    }

    const collectionParticipantes = db.collection("participantes")
    const participantes = await collectionParticipantes.find().toArray()
    participantes.map(objeto => verificaTempo(objeto))

    
    
  }

setInterval(intervalo, 15000)
  
  











app.delete("/mensagens/:id", async(req, res)=> {

    const { id } = req.params

    try{
        const resposta = db.collection("mensagens");
        await resposta.deleteOne({ _id: ObjectId(id) })
        res.send("Mensagem apagada").status(200)
    }catch(error){

        console.log(error);
        res.send("HOUVE ERRO AO DELETAR A MENSAGEM!").status(500)
    }
});

app.delete("/participantes/:id", async(req, res)=> {

    const { id } = req.params

    try{
        const resposta = db.collection("participantes");
        await resposta.deleteOne({ _id: ObjectId(id) })
        res.send("Participante apagado").status(200)
    }catch(error){

        console.log(error);
        res.send("HOUVE ERRO AO DELETAR O PARTICIPANTE!").status(500)
    }
});


app.listen(5000, () => console.log('App running in port 5000'))