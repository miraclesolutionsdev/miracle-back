import { Router } from "express"
import { crearLead } from "../controllers/leadContacto.controller.js"

const router = Router()

router.post("/", crearLead)

export default router

