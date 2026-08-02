import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/** One session lookup per React request (header + page share it). */
export const getSession = cache(() => getServerSession(authOptions));
