// src/pages/StoryCreator.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sparkles, BookOpen, Edit, Headphones, RotateCw, Save, Play, Pause,
  PenTool, Loader2, AlertCircle, LogIn, Download, Share2, MicVocal, ServerCrash, Volume2, Copy, CheckCircle
} from 'lucide-react';
import { Database, TablesInsert } from '@/integrations/supabase/types';
import { Link, useLocation, useNavigate } from 'react-router-dom';

// Interface for fetched voice data
interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

// Zod Schema (ageRange REMOVED, storyTitle kept for internal state)
const storyParamsSchema = z.object({
  storyTitle: z.string().max(150, "Title too long").optional().nullable(),
  theme: z.string().min(1, "Theme is required."),
  mainCharacter: z.string().max(50).optional().nullable(),
  educationalFocus: z.string().optional().nullable(),
  additionalInstructions: z.string().max(500).optional().nullable(),
});

type StoryParamsFormValues = z.infer<typeof storyParamsSchema>;
type StoryInsertData = TablesInsert<'stories'>;

const FREE_GEN_KEY = 'storyTimeFreeGenUsed';

// Helper function
function capitalizeFirstLetter(string: string | null | undefined) {
  if (!string) return '';
  if (string.toLowerCase() === 'us') return 'US';
  if (string.toLowerCase() === 'uk') return 'UK';
  return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

const StoryCreator: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [storyContent, setStoryContent] = useState<string>('');
  const [generatedStoryId, setGeneratedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("parameters");
  const [freeGenUsed, setFreeGenUsed] = useState<boolean>(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | undefined>(undefined);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);

  // Scroll to top on initial component mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Check for return tab from login/signup
  useEffect(() => {
    // Check if we're returning from login/signup with a specified tab to return to
    if (location.state && location.state.returnToTab) {
      console.log("Returning to tab:", location.state.returnToTab);
      setActiveTab(location.state.returnToTab);
      
      // Clear the state so it doesn't happen again on refresh
      // Use history.replaceState to avoid triggering a new navigation
      window.history.replaceState(
        {}, 
        document.title,
        location.pathname
      );
    }
  }, [location]);

  // Scroll to top when the active tab changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Existing effect for free gen check & audio cleanup
  useEffect(() => {
    const storedValue = localStorage.getItem(FREE_GEN_KEY);
    setFreeGenUsed(storedValue === 'true');
    return () => {
        if (previewAudioRef.current) {
            previewAudioRef.current.pause();
            previewAudioRef.current = null;
        }
    };
  }, []);

  const form = useForm<StoryParamsFormValues>({
    resolver: zodResolver(storyParamsSchema),
    defaultValues: {
      storyTitle: "", // Keep for internal state / AI suggestion
      theme: "adventure",
      mainCharacter: "",
      educationalFocus: null,
      additionalInstructions: "",
    },
  });

  // Fetch ElevenLabs Voices
  const { data: voiceData, isLoading: isLoadingVoices, isError: isVoiceError } = useQuery<{ voices: ElevenLabsVoice[] }, Error>({
      queryKey: ['elevenlabs-voices'],
      queryFn: async () => {
          console.log("Fetching ElevenLabs voices via Edge Function...");
          const { data, error } = await supabase.functions.invoke('get-elevenlabs-voices');
          if (error) throw new Error(`Failed to fetch voices: ${error.message}`);
          if (data?.error) throw new Error(`Failed to fetch voices: ${data.error}`);
          if (!data || !Array.isArray(data.voices)) throw new Error("Received invalid data format for voices.");
          console.log(`Received ${data.voices.length} voices.`);
          return data;
       },
      staleTime: 1000 * 60 * 60, // Cache for 1 hour
      refetchOnWindowFocus: false,
  });

    // Story Generation Mutation
    const generateStoryMutation = useMutation({
      mutationFn: async (params: { formData: StoryParamsFormValues, isAnonymous: boolean }): Promise<{ story: string, title: string, isAnonymous: boolean }> => {
        const { data, error } = await supabase.functions.invoke('anthropic-generate-story', { body: params.formData });
        if (error) throw new Error(`Edge Function Error: ${error.message}`);
        if (data?.error) throw new Error(`Generation Error: ${data.error}`);
        if (!data?.story || typeof data.title === 'undefined') throw new Error("Invalid response received from generation function (missing story or title).");
        return { story: data.story as string, title: data.title as string, isAnonymous: params.isAnonymous };
      },
      onSuccess: ({ story, title: returnedTitle }) => {
        setStoryContent(story);
        setGeneratedStoryId(null);
        setGeneratedAudioUrl(null);
        setSelectedVoiceId(undefined);
        // Store the AI suggested title (or empty) in the form state
        form.setValue('storyTitle', returnedTitle || "", { shouldValidate: false });

        // --- TOAST REMOVED ---
        // console.log("Story generated, moving to edit tab."); // Optional console log

        setActiveTab("edit");
      },
      onError: (error: Error) => {
         toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
      },
    });

    // Audio Generation Mutation
    const generateAudioMutation = useMutation({
        mutationFn: async ({ text, voiceId }: { text: string, voiceId: string }): Promise<{ audioUrl: string }> => {
            if (!text || !voiceId) throw new Error("Story text and Voice ID are required for narration.");
            const { data, error } = await supabase.functions.invoke('elevenlabs-tts', { body: { text, voiceId } });
            if (error) throw new Error(`Edge Function Error: ${error.message}`);
            if (data?.error) throw new Error(`Audio Generation Error: ${data.error}`);
            if (!data?.audioUrl) throw new Error("No audio URL received from function.");
            return { audioUrl: data.audioUrl as string };
        },
        onSuccess: ({ audioUrl }) => {
            setGeneratedAudioUrl(audioUrl);
            // Automatically move to share tab once audio is generated
            setActiveTab("share");
        },
    });

    // Save Mutation
    const saveStoryMutation = useMutation({
      mutationFn: async (storyData: StoryInsertData) => {
        if (!user?.id) throw new Error("User not logged in.");
        const educationalElements = storyData.educationalFocus ? [storyData.educationalFocus] : null;
        // Data to save, ageRange is excluded
        const dataToSave: StoryInsertData = {
            ...storyData,
            user_id: user.id,
            content: storyContent,
            title: storyData.title || "Untitled Story",
            educational_elements: educationalElements,
        };
        // Explicitly remove properties not in the insert type if needed (optional safety)
        delete (dataToSave as any).educationalFocus;
        delete (dataToSave as any).age_range;

        const { data, error } = await supabase.from('stories').upsert(dataToSave).select().single();
        if (error) throw error;
        return data;
      },
      onSuccess: (data) => {
        setGeneratedStoryId(data.id);
        toast({ title: "Story Saved!", description: "Your story has been saved to your library." });
        queryClient.invalidateQueries({ queryKey: ['userStories', user?.id] });
      },
      onError: (error: Error) => {
        toast({ title: "Save Failed", description: error.message, variant: "destructive" });
      },
    });

    // Generate Submit Handler
    const onGenerateSubmit: SubmitHandler<StoryParamsFormValues> = (formData) => {
      const isAnonymous = !user;
      generateStoryMutation.mutate({ formData, isAnonymous });
    };

    // Save Handler
    const handleSaveStory = () => {
      if (!user) {
         toast({
             title: "Login Required", description: "Please log in or sign up to save stories.", variant: "destructive",
             action: ( <> 
               <Button onClick={() => navigate('/login', { 
                 state: { from: location, returnToTab: activeTab }, 
                 replace: true 
               })} size="sm">Login</Button> 
               <Button onClick={() => navigate('/signup', { 
                 state: { from: location, returnToTab: activeTab }, 
                 replace: true 
               })} size="sm" variant="outline">Sign Up</Button> 
             </> )
         });
         return;
      }
      if (!storyContent) {
         toast({ title: "Cannot Save", description: "No story content to save.", variant: "destructive"});
         return;
      }
      const currentInternalFormTitle = form.getValues('storyTitle');
      const firstLineBreak = storyContent.indexOf('\n');
      const potentialTitleFromContent = (firstLineBreak === -1 ? storyContent : storyContent.substring(0, firstLineBreak)).trim();
      const titleToSave = potentialTitleFromContent || currentInternalFormTitle || "Untitled Story";

      const storyDataToSave: Partial<StoryInsertData> & { educationalFocus?: string | null } = {
        id: generatedStoryId || undefined,
        user_id: user.id,
        title: titleToSave,
        content: storyContent,
        themes: form.getValues('theme') ? [form.getValues('theme')] : null,
        educationalFocus: form.getValues('educationalFocus') || null,
      };
      saveStoryMutation.mutate(storyDataToSave as StoryInsertData);
    };

    // Handle Narration Generation
    const handleGenerateNarration = () => {
        if (!storyContent || !selectedVoiceId) { toast({title: "Missing Input", description:"Ensure story text exists and a voice is selected.", variant: "destructive"}); return; }
        setGeneratedAudioUrl(null);
        generateAudioMutation.mutate({ text: storyContent, voiceId: selectedVoiceId });
    };

    // Handle Voice Preview
    const handlePreviewVoice = () => {
      const voice = voiceData?.voices?.find(v => v.voice_id === selectedVoiceId);
      if (!voice || !voice.preview_url) return;

      if (previewAudioRef.current) {
        if (isPreviewPlaying) {
          previewAudioRef.current.pause();
          setIsPreviewPlaying(false);
        } else {
          // Ensure URL is set correctly before playing
          if (previewAudioRef.current.src !== voice.preview_url) {
            previewAudioRef.current.src = voice.preview_url;
            previewAudioRef.current.load(); // Load the new source
          }
          previewAudioRef.current.play().then(() => setIsPreviewPlaying(true)).catch(console.error);
        }
      } else {
        // Create and play
        const audio = new Audio(voice.preview_url);
        previewAudioRef.current = audio;
        audio.play().then(() => setIsPreviewPlaying(true)).catch(console.error);
        audio.onended = () => setIsPreviewPlaying(false);
        audio.onpause = () => { if (audio.ended) setIsPreviewPlaying(false); }; // Handle pause ending preview state
      }
    };

    // Handle Download using Blob
    const handleDownloadAudio = async () => {
      if (!generatedAudioUrl) return;
      setIsDownloading(true);
      try {
          const response = await fetch(generatedAudioUrl);
          if (!response.ok) throw new Error(`Failed to fetch audio: ${response.statusText}`);
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          const title = (form.getValues('storyTitle') || 'storytime-audio').replace(/[^a-z0-9]/gi, '_').toLowerCase();
          a.download = `${title}.mp3`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          toast({ title: "Download Started!" });
      } catch (error: any) {
          console.error("Download failed:", error);
          toast({ title: "Download Failed", description: error.message, variant: "destructive" });
      } finally {
          setIsDownloading(false);
      }
    };

    // Helper to get selected voice details
    const selectedVoiceDetails = selectedVoiceId ? voiceData?.voices?.find(v => v.voice_id === selectedVoiceId) : null;

  return (
    <div className="min-h-screen bg-storytime-background py-12">
      <div className="container mx-auto px-6">
        <h1 className="text-3xl font-bold mb-4 font-display text-gray-700">Story Creator Studio</h1>
        {!user && freeGenUsed && (
          <Alert variant="destructive" className="mb-6 animate-fade-in">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Free Generation Used</AlertTitle>
            <AlertDescription>
              You've used your free story generation. Please <Link to="/login" className="underline font-medium">Login</Link> or <Link to="/signup" className="underline font-medium">Sign Up</Link> to create more.
              <span className='block text-xs mt-1'>(Note: This limit is temporarily waived for the Supabase Build Competition!)</span>
            </AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="parameters" className="flex items-center gap-2"><PenTool className="h-4 w-4" /><span>Story Outline</span></TabsTrigger>
                <TabsTrigger value="edit" disabled={!storyContent} className="flex items-center gap-2"><Edit className="h-4 w-4" /><span>Edit / Preview</span></TabsTrigger>
                <TabsTrigger value="voice" disabled={!storyContent} className="flex items-center gap-2"><Headphones className="h-4 w-4" /><span>Voice & Audio</span></TabsTrigger>
                <TabsTrigger value="share" disabled={!generatedStoryId || !generatedAudioUrl} className="flex items-center gap-2"><Share2 className="h-4 w-4" /><span>Share Story</span></TabsTrigger>
              </TabsList>

              {/* Story Outline Tab Content */}
              <TabsContent value="parameters" className="mt-0">
                 <Card>
                   <CardHeader>
                     <CardTitle>Story Outline</CardTitle>
                     <CardDescription>Provide the story details (story is generated for young children, ~3 min length).</CardDescription>
                   </CardHeader>
                   <CardContent className="space-y-6 pt-6">
                     <FormField control={form.control} name="theme" render={({ field }) => (<FormItem><FormLabel>Theme</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select theme" /></SelectTrigger></FormControl><SelectContent><SelectItem value="adventure">Adventure</SelectItem><SelectItem value="fantasy">Fantasy</SelectItem><SelectItem value="animals">Animals</SelectItem><SelectItem value="friendship">Friendship</SelectItem><SelectItem value="space">Space</SelectItem><SelectItem value="ocean">Ocean</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="mainCharacter" render={({ field }) => (<FormItem><FormLabel>Main Character Name <span className="text-xs text-gray-500">(Optional)</span></FormLabel><FormControl><Input placeholder="E.g., Luna, Finn" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="educationalFocus" render={({ field }) => (<FormItem><FormLabel>Educational Focus <span className="text-xs text-gray-500">(Optional)</span></FormLabel><Select onValueChange={field.onChange} value={field.value ?? undefined}><FormControl><SelectTrigger><SelectValue placeholder="Select focus (optional)" /></SelectTrigger></FormControl><SelectContent><SelectItem value="kindness">Kindness</SelectItem><SelectItem value="courage">Courage</SelectItem><SelectItem value="curiosity">Curiosity</SelectItem><SelectItem value="perseverance">Perseverance</SelectItem><SelectItem value="teamwork">Teamwork</SelectItem><SelectItem value="patience">Patience</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="additionalInstructions" render={({ field }) => (<FormItem><FormLabel>Additional Instructions <span className="text-xs text-gray-500">(Optional)</span></FormLabel><FormControl><Textarea placeholder="E.g., Include a talking squirrel..." {...field} value={field.value ?? ""} /></FormControl><FormDescription className="text-xs">Max 500 characters.</FormDescription><FormMessage /></FormItem>)} />
                   </CardContent>
                   <CardFooter>
                     <Button type="button" onClick={form.handleSubmit(onGenerateSubmit)} disabled={generateStoryMutation.isPending} className="w-full bg-storytime-purple hover:bg-storytime-purple/90 text-white rounded-full h-11">
                       {generateStoryMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating... (est. 15-30s)</>) : (<><Sparkles className="mr-2 h-4 w-4" /> Generate Story {!user ? '(Free)' : ''}</>)}
                     </Button>
                   </CardFooter>
                 </Card>
              </TabsContent>

              {/* Edit / Preview Tab Content */}
              <TabsContent value="edit">
                 <Card>
                   <CardHeader> <CardTitle>Edit / Preview Story</CardTitle> <CardDescription>Review and edit the generated story text. The first line will be used as the title when saving.</CardDescription> </CardHeader>
                   <CardContent className="space-y-6 pt-6"> <div className="space-y-2"> <Label htmlFor="story-content-editor">Story Text (Edit Title as First Line)</Label> <Textarea id="story-content-editor" placeholder="Generated story text will appear here..." value={storyContent} onChange={(e) => setStoryContent(e.target.value)} rows={15} className="min-h-[300px] text-base leading-relaxed" /> </div> </CardContent>
                   <CardFooter className="flex justify-between"> <Button type="button" variant="outline" onClick={() => setActiveTab('parameters')}> <RotateCw className="mr-2 h-4 w-4" /> Re-generate </Button> <Button type="button" onClick={() => setActiveTab('voice')} disabled={!storyContent} className="bg-storytime-blue hover:bg-storytime-blue/90 text-white"> Next: Add Voice <Headphones className="ml-2 h-4 w-4" /> </Button> </CardFooter>
                 </Card>
              </TabsContent>

              {/* Voice & Audio Tab Content */}
              <TabsContent value="voice">
                 <Card>
                   <CardHeader><CardTitle>Add Narration</CardTitle><CardDescription>Select a voice, preview it, and generate audio for your story.</CardDescription></CardHeader>
                   <CardContent className="space-y-6">
                     {/* Voice Selection */}
                     <div className='space-y-2'>
                       <Label htmlFor="voice-select">Choose a Voice</Label>
                       <div className="flex items-center gap-2">
                         <div className="flex-grow">
                           {isLoadingVoices && ( <div className="flex items-center space-x-2 text-muted-foreground h-10 px-3"><Loader2 className="h-4 w-4 animate-spin" /><span>Loading voices...</span></div> )}
                           {isVoiceError && ( <Alert variant="destructive" className="flex items-center h-10"><ServerCrash className="h-4 w-4 mr-2"/><AlertDescription>Could not load voices.</AlertDescription></Alert> )}
                           {!isLoadingVoices && !isVoiceError && voiceData?.voices && ( <Select value={selectedVoiceId} onValueChange={(value) => { previewAudioRef.current?.pause(); setIsPreviewPlaying(false); setSelectedVoiceId(value); setGeneratedAudioUrl(null); }}> <SelectTrigger id="voice-select"><SelectValue placeholder="Select a voice..." /></SelectTrigger> <SelectContent>{voiceData.voices.map(voice => ( <SelectItem key={voice.voice_id} value={voice.voice_id}>{voice.name} {voice.labels?.accent ? `(${capitalizeFirstLetter(voice.labels.accent)})` : ''} {voice.category === 'professional' ? '(Pro)' : ''}</SelectItem> ))}</SelectContent> </Select> )}
                         </div>
                         <Button variant="outline" size="icon" title="Preview Selected Voice" onClick={handlePreviewVoice} disabled={!selectedVoiceId || isLoadingVoices || isVoiceError || !selectedVoiceDetails?.preview_url}> {isPreviewPlaying ? <Pause className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}<span className="sr-only">Preview Voice</span> </Button>
                       </div>
                       {selectedVoiceDetails?.description && ( <p className='text-sm text-muted-foreground pt-1'>{selectedVoiceDetails.description}</p> )}
                       {selectedVoiceId && !isLoadingVoices && !isVoiceError && !selectedVoiceDetails?.preview_url && (<p className='text-xs text-destructive pt-1'>Preview not available.</p>)}
                     </div>
                     {/* Generate Narration Button */}
                      <Button type="button" onClick={handleGenerateNarration} disabled={!storyContent || !selectedVoiceId || generateAudioMutation.isPending || isLoadingVoices || isVoiceError} className='w-full bg-storytime-blue hover:bg-storytime-blue/90 text-white'> {generateAudioMutation.isPending ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Audio... (est. 15-60s)</>) : (<><MicVocal className="mr-2 h-4 w-4" /> Generate Narration</>)} </Button>
                     {/* Audio Generation Error Display */}
                     {generateAudioMutation.isError && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Audio Generation Error</AlertTitle><AlertDescription>{generateAudioMutation.error.message}</AlertDescription></Alert>)}
                   </CardContent>
                 </Card>
              </TabsContent>

              {/* Share Tab Content */}
               <TabsContent value="share">
                 <Card>
                   <CardHeader> <CardTitle>Save Your Story</CardTitle> <CardDescription>Your audio is ready! Use the options below to save and share your story.</CardDescription> </CardHeader>
                   <CardContent className="space-y-6 pt-6">
                    {generatedAudioUrl ? (
                      <div className="space-y-4">
                        <audio 
                          ref={el => mainAudioRef.current = el}
                          controls 
                          src={generatedAudioUrl} 
                          className="w-full rounded-md shadow-sm border border-gray-200 focus:outline-none focus:ring-2 focus:ring-storytime-blue"
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}>
                          Your browser does not support the audio element.
                        </audio>
                        <div className="grid grid-cols-1 gap-3">
                          <Button 
                            type="button" 
                            className="w-full bg-storytime-blue hover:bg-storytime-blue/90 text-white"
                            onClick={() => {
                              if (mainAudioRef.current) {
                                if (isPlaying) {
                                  mainAudioRef.current.pause();
                                } else {
                                  mainAudioRef.current.play();
                                }
                              }
                            }}
                          >
                            {isPlaying ? <Pause className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />} 
                            {isPlaying ? 'Pause' : 'Listen'}
                          </Button>
                          
                          <Button type="button" onClick={() => { generatedAudioUrl && navigator.clipboard.writeText(generatedAudioUrl)
                               .then(() => toast({ title: "Audio Link Copied!"}))}} className="w-full bg-storytime-purple hover:bg-storytime-purple/90 text-white">
                            <Share2 className="mr-2 h-4 w-4" /> Share
                          </Button>
                          
                          <Button type="button" onClick={handleDownloadAudio} disabled={isDownloading} className="w-full bg-storytime-orange hover:bg-storytime-orange/90 text-white">
                            {isDownloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                            Download
                          </Button>
                          
                          <Button type="button" onClick={handleSaveStory} disabled={!user || saveStoryMutation.isPending} className="w-full bg-storytime-green hover:bg-storytime-green/90 text-white">
                            {saveStoryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Save to Library{user ? '' : ' (Requires Login)'}
                          </Button>
                        </div>
                        
                        {!user && (
                          <div className="text-center mt-4">
                            <p className="text-sm text-muted-foreground mb-2">You need to be logged in to save your story.</p>
                            <div className="flex justify-center space-x-2">
                              <Link to="/login"><Button variant="outline" size="sm">Log In</Button></Link>
                              <Link to="/signup"><Button size="sm">Sign Up</Button></Link>
                            </div>
                          </div>
                        )}
                        
                        {generatedStoryId && (
                          <div className="mt-6 text-center">
                            <p className="text-green-600 font-medium mb-4">
                              <CheckCircle className="inline-block mr-2 h-5 w-5" /> Story saved successfully!
                            </p>
                            <Link to="/dashboard">
                              <Button className="bg-storytime-green hover:bg-storytime-green/90">
                                <BookOpen className="mr-2 h-4 w-4"/> View in Dashboard
                              </Button>
                            </Link>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className='text-muted-foreground italic py-8 text-center'>
                        Please generate audio for your story first (in the 'Voice & Audio' tab).
                      </p>
                    )}
                   </CardContent>
                 </Card>
              </TabsContent>

            </Tabs>
          </form>
        </Form>
      </div>
    </div>
  );
};

export default StoryCreator;