import mongoose from "mongoose"

const iaResumenSchema = new mongoose.Schema(
  {
    producto: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    angulo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    copys: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    imagenPorCopy: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    mensajes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true, collection: "ia_resumenes" }
)

export default mongoose.model("IaResumen", iaResumenSchema)
