import { SimulatedRoute } from "~/types"

const waitForRoutes = async (_routes: Promise<Error | SimulatedRoute[]>) => {
  await new Promise(r => setTimeout(r, 100))
  const routes = await _routes

  if (routes instanceof Error) {
    throw new Error("routes must not be an error: " + routes.message)
  }

  return routes
}

export default waitForRoutes
