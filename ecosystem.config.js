module.exports = {
  apps : [{
    name: "afterschool-backend",
    script: "./dist/src/main.js", // Ruta al archivo compilado
    instances: "max",             // Usa todos los núcleos del CPU
    exec_mode: "cluster",         // Habilita el modo Cluster
    autorestart: true,            // Reinicia si el proceso muere
    watch: false,                 // No vigilar archivos en producción
    max_memory_restart: '1G',     // Reinicia si consume más de 1GB de RAM
    env: {
      NODE_ENV: "production",
      PORT: 3007
    }
  }]
};
