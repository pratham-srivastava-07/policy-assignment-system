import { redirect } from "next/navigation"

/** §6.1: there is no dashboard. The Employees workspace is the landing surface. */
export default function Home() {
  redirect("/employees")
}
