import './style.css'
import { initScene } from './scene.js'

document.querySelector('#app').innerHTML = `
  <canvas id="bg"></canvas>
  <h1>Hola mundo</h1>
`

initScene(document.querySelector('#bg'))
