'use client'

import { motion } from 'framer-motion'
import { ArrowRight, GitCommit, Zap, Shield, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ShipText } from './_components/v1-text'
import { ReactNode } from 'react'

export default function V1Ship() {
  return (
    <div className="min-h-screen bg-transparnt text-white overflow-hidden">
      <div className="h-[50vh] bg-transparent/10 relative">

        <ShipText />
        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-center">
          <Badge className="mb-4 bg-white/10 text-white hover:bg-white/20">Just Released</Badge>
          <h1 className="text-5xl font-bold mb-4 font-mono">
            V1 Release | Nov 2024
          </h1>
          <p className="text-lg text-gray-400 max-w-xl mx-auto">
            A major milestone with groundbreaking features and improvements
          </p>
        </div>
      </div>

      <div className="relative py-24">
        <div className="absolute inset-0 z-0">
          <div className="grid grid-cols-12 h-full">
            {Array(12).fill(null).map((_, i) => (
              <div key={i} className="border-l border-dashed border-white/10 h-full" />
            ))}
          </div>
          <div className="grid grid-rows-12 w-full absolute top-0">
            {Array(12).fill(null).map((_, i) => (
              <div key={i} className="border-t border-dashed border-white/10 w-full" />
            ))}
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <h2 className="text-3xl font-bold mb-12 font-geist text-center">Major Changes</h2>
          <motion.div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <ChangeCard title="Performance" description="50% faster load times" />
            <ChangeCard title="Security" description="End-to-end encryption" />
            <ChangeCard title="UI/UX" description="Complete design overhaul" />
            <ChangeCard title="API" description="New endpoints added" />
            <ChangeCard title="Scalability" description="Improved architecture" />
            <ChangeCard title="Documentation" description="Comprehensive guides" />
          </motion.div>
        </div>
      </div>

      <ReleaseRelated />

      <div className="max-w-6xl mx-auto px-6 py-24">
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <FeatureCard
            icon={<Zap className="w-6 h-6" />}
            title="Enhanced Performance"
            description="50% faster load times and optimized resource usage"
          />
          <FeatureCard
            icon={<Shield className="w-6 h-6" />}
            title="Advanced Security"
            description="End-to-end encryption and improved authentication"
          />
          <FeatureCard
            icon={<GitCommit className="w-6 h-6" />}
            title="New Architecture"
            description="Rebuilt from ground up for better scalability"
          />
        </motion.div>

        <motion.div
          className="text-center mt-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            size="lg"
            className="bg-white text-black hover:bg-gray-200 font-medium"
          >
            Get Started <ArrowRight className="ml-2 w-4 h-4" />
          </Button>
        </motion.div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-24">
          <h2 className="text-3xl font-bold mb-12 font-geist">Changelog</h2>
          <div className="space-y-8">
            <ChangelogItem
              version="1.0.0"
              date="2024"
              changes={[
                "Complete UI overhaul with modern design system",
                "New API endpoints for enhanced functionality",
                "Improved documentation and developer experience",
                "Bug fixes and performance improvements"
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ReleaseRelated() {
  return (
    <div className="relative bg-transparent/10 border-b-2 border-white/10 rounded-none text-white py-24">
      <div className="absolute inset-0 z-0">
        <div className="grid grid-cols-12 h-full">
          {Array(12).fill(null).map((_, i) => (
            <div key={i} className="border-l border-dashed border-white/10 h-full" />
          ))}
        </div>
        <div className="grid grid-rows-12 w-full absolute top-0">
          {Array(12).fill(null).map((_, i) => (
            <div key={i} className="border-t border-dashed border-white/10 w-full" />
          ))}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <h2 className="text-7xl font-bold mb-16 font-geist leading-tight">
          What will you<br />do next?
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-semibold mb-4">Installation</h3>
            <div className="bg-white/5 rounded-lg p-4 mb-2">
              <code className="text-sm font-mono">npm i better-auth@canary</code>
            </div>
            <p className="text-sm text-gray-400">
              Get the latest <a href="#" className="underline">Node.js and npm</a>.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4">Use in Next.js</h3>
            <div className="bg-white/5 rounded-lg p-4 mb-2">
              <code className="text-sm font-mono">
                import &#123; betterAuth &#125; from '@better-auth'<br />
              </code>
            </div>
            <p className="text-sm text-gray-400">
              Include this code in <code className="text-xs bg-white/10 px-1 py-0.5 rounded">app/layout.js</code> for App Router, or <code className="text-xs bg-white/10 px-1 py-0.5 rounded">pages/_app.js</code> for Pages Router.
              View the <a href="#" className="underline">README</a> for full instructions.
            </p>
          </div>
          <div>
            <h3 className="text-xl font-semibold mb-4">Get the ui builder</h3>
            <p className="text-sm text-gray-400 mb-4">
              Contains <strong>otf</strong><strong>UI</strong> and <strong>block</strong>of your choice.<br />
              Licensed under <a href="#" className="underline">better-auth</a>. Use it on your sites and projects.
              <a href="#" className="underline block mt-2">Read the license</a>.
            </p>
            <Button variant="outline" className="w-full justify-between">
              Get started <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureCard({ icon, title, description }: { icon: ReactNode, title: string, description: string }) {
  return (
    <div className="p-6 rounded-none border border-white/10 bg-white/5 hover:bg-white/10 transition-colors">
      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 font-geist">{title}</h3>
      <p className="text-gray-400">{description}</p>
    </div>
  )
}

function ChangelogItem({ version, date, changes }: { version: string, date: string, changes: string[] }) {
  return (
    <div className="border-l-2 border-white/10 pl-6 relative">
      <div className="absolute w-3 h-3 bg-white rounded-full -left-[7px] top-2" />
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-xl font-bold font-geist">{version}</h3>
        <span className="text-sm text-gray-400">{date}</span>
      </div>
      <ul className="space-y-3">
        {changes.map((change, i) => (
          <li key={i} className="text-gray-400">
            {change}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangeCard({ title, description }: { title: string, description: string }) {
  return (
    <Card className="bg-white/5 rounded-none border-white/10 hover:bg-white/10 transition-colors">
      <div className="p-6">
        <h3 className="text-xl font-bold mb-2 font-geist-mono">{title}</h3>
        <p className="text-gray-400 font-geist-mono">{description}</p>
      </div>
    </Card>
  )
}
