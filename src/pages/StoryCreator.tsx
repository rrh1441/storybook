import React, { useState, useEffect } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Sparkles, BookOpen, Edit, Headphones, RotateCw, Save, Play, PenTool, Loader2, AlertCircle, LogIn } from 'lucide-react';
import { Database, TablesInsert } from '@/integrations/supabase/types';
import { Link } from 'react-router-dom';

// Zod Schema remains the same (title is optional)
const storyParamsSchema = z.object({
  storyTitle: z.string().max(150, "Title too long").optional().nullable(),
  ageRange: z.string().min(1, "Age range is required."),
  storyLength: z.string().min(1, "Story length is required."),
  theme: z.string().min(1, "Theme is required."),
  mainCharacter: z.string().max(50).optional().nullable(),
  educationalFocus: z.string().optional().nullable(),
  additionalInstructions: z.string().max(500).optional().nullable(),
});

type StoryParamsFormValues = z.infer<typeof storyParamsSchema>;
type StoryInsertData = TablesInsert<'stories'>;

const FREE_GEN_KEY = 'storyTimeFreeGenUsed';

const StoryCreator: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [storyContent, setStoryContent] = useState<string>('');
  const [generatedStoryId, setGeneratedStoryId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("parameters");
  const [freeGenUsed, setFreeGenUsed] = useState<boolean>(false);

  useEffect(() => {
    const storedValue = localStorage.getItem(FREE_GEN_KEY);
    if (storedValue === 'true') {
      console.log("Free generation flag found in localStorage.");
      setFreeGenUsed(true);
    } else {
      console.log("No free generation flag found.");
      setFreeGenUsed(false);
    }
  }, []);

  const form = useForm<StoryParamsFormValues>({
    resolver: zodResolver(storyParamsSchema),
    defaultValues: {
      storyTitle: "",
      ageRange: "4-8",
      storyLength: "medium",
      theme: "adventure",
      mainCharacter: "",
      educationalFocus: null,
      additionalInstructions: "",
    },
  });

  // --- Generate Mutation ---
  const generateStoryMutation = useMutation({
    mutationFn: async (params: { formData: StoryParamsFormValues, isAnonymous: boolean }): Promise<{ story: string, title: string, isAnonymous: boolean }> => {
      console.log("Calling anthropic-generate-story with:", params.formData);
      const { data, error } = await supabase.functions.invoke('anthropic-generate-story', {
        body: params.formData,
      });
      if (error) throw new Error(`Edge Function Error: ${error.message}`);
      if (data.error) throw new Error(`Generation Error: ${data.error}`);
      if (!data.story || typeof data.title === 'undefined') {
           throw new Error("Invalid response received from generation function (missing story or title).");
      }
      return {
          story: data.story as string,
          title: data.title as string,
          isAnonymous: params.isAnonymous
      };
    },
    onSuccess: ({ story, title: returnedTitle, isAnonymous }) => {
      setStoryContent(story);
      setGeneratedStoryId(null);
      const currentFormTitle = form.getValues('storyTitle');
      if (returnedTitle && returnedTitle !== currentFormTitle) {
          form.setValue('storyTitle', returnedTitle, { shouldValidate: true });
           toast({ title: "Story & Title Generated!", description: "Review your story draft and the generated title below." });
      } else {
          toast({ title: "Story Generated!", description: "Review your story draft below." });
      }
      setActiveTab("edit");
      if (isAnonymous) {
        try {
          localStorage.setItem(FREE_GEN_KEY, 'true');
          setFreeGenUsed(true);
          console.log("Free generation used and flag set in localStorage.");
        } catch (e) {
          console.error("Failed to set localStorage item:", e);
        }
      }
    },
    onError: (error: Error) => {
      console.error("Story generation failed:", error);
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  // --- Save Mutation ---
  const saveStoryMutation = useMutation({
    mutationFn: async (storyData: StoryInsertData) => {
      console.log("Saving story to database:", storyData);
      if (!user?.id) throw new Error("User not logged in.");
      const educationalElements = storyData.educationalFocus ? [storyData.educationalFocus] : null;
      const dataToSave: StoryInsertData = {
        ...storyData,
        user_id: user.id,
        content: storyContent,
        title: storyData.title || "Untitled Story",
        educational_elements: educationalElements,
      };
      delete (dataToSave as any).educationalFocus;
      const { data, error } = await supabase.from('stories').upsert(dataToSave).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setGeneratedStoryId(data.id);
      toast({ title: "Story Saved!", description: "Your story has been saved to your library." });
      queryClient.invalidateQueries({ queryKey: ['stories', user?.id] });
    },
    onError: (error: Error) => {
      console.error("Story save failed:", error);
      toast({ title: "Save Failed", description: error.message, variant: "destructive" });
    },
  });

  // --- Generate Submit Handler (Limit check temporarily commented out) ---
  const onGenerateSubmit: SubmitHandler<StoryParamsFormValues> = (formData) => {
    const isAnonymous = !user;
    console.log(`Generation attempt: Anonymous=${isAnonymous}, FreeGenUsed=${freeGenUsed}`);
    // // --- Temporarily Disabled Paywall/Rate Limit ---
    // if (isAnonymous && freeGenUsed) {
    //   console.log("Blocking generation: Anonymous user already used free gen.");
    //   toast({ /* ... toast options ... */ });
    //   return;
    // }
    // // --- End of Disabled Block ---
    console.log("Proceeding with generation...");
    generateStoryMutation.mutate({ formData, isAnonymous });
  };

  // --- Save Handler ---
  const handleSaveStory = () => {
    if (!storyContent) { toast({ title: "Cannot Save", description: "Please generate or write a story first.", variant: "destructive" }); return; }
    if (!user) { toast({ title: "Not Logged In", description: "Please log in to save your story.", variant: "destructive" }); return; }
    const currentFormValues = form.getValues();
    const storyDataToSave: Partial<StoryInsertData> & { educationalFocus?: string | null } = {
      id: generatedStoryId || undefined,
      user_id: user.id,
      title: currentFormValues.storyTitle,
      content: storyContent,
      age_range: currentFormValues.ageRange,
      themes: currentFormValues.theme ? [currentFormValues.theme] : null,
      educationalFocus: currentFormValues.educationalFocus || null,
    };
    saveStoryMutation.mutate(storyDataToSave as StoryInsertData);
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-storytime-background py-12">
      <div className="container mx-auto px-6">
        <h1 className="text-3xl font-bold mb-4 font-display text-gray-700">Story Creator Studio</h1>

        {!user && freeGenUsed && (
          <Alert variant="destructive" className="mb-6 animate-fade-in">
            <LogIn className="h-4 w-4" />
            <AlertTitle>Free Generation Used (Limit Currently Disabled)</AlertTitle>
            <AlertDescription>
              You've already used your one free story generation for this session. The limit is currently turned off for testing.{' '}
              Normally, you would need to <Link to="/signup" className="font-medium underline hover:text-destructive/80">Sign Up</Link> or{' '}
              <Link to="/login" className="font-medium underline hover:text-destructive/80">Log In</Link> to create and save unlimited stories.
            </AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={(e) => e.preventDefault()}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="parameters" className="flex items-center gap-2">
                  <PenTool className="h-4 w-4" />
                  <span>Parameters</span>
                </TabsTrigger>
                <TabsTrigger value="edit" disabled={!storyContent} className="flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  <span>Edit / Preview</span>
                </TabsTrigger>
                {/* MODIFIED: Enable tabs if story content exists */}
                <TabsTrigger value="voice" disabled={!storyContent} className="flex items-center gap-2">
                  <Headphones className="h-4 w-4" />
                  <span>Voice & Audio</span>
                </TabsTrigger>
                <TabsTrigger value="publish" disabled={!storyContent} className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  <span>Publish</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="parameters" className="mt-0">
                <Card>
                  <CardHeader><CardTitle>Story Details</CardTitle><CardDescription>Set the parameters for your AI-generated story.</CardDescription></CardHeader>
                  <CardContent className="space-y-6 pt-6">
                    <FormField
                      control={form.control}
                      name="storyTitle"
                      render={({ field }) => (
                        <FormItem>
                           {/* MODIFIED: Label updated */}
                          <FormLabel>Story Title <span className="text-xs text-gray-500">(Optional - we can make one for you!)</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Enter a title (or leave blank for AI)" {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <FormField control={form.control} name="ageRange" render={({ field }) => (<FormItem><FormLabel>Age Range</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select age" /></SelectTrigger></FormControl><SelectContent><SelectItem value="0-3">0-3</SelectItem><SelectItem value="4-6">4-6</SelectItem><SelectItem value="4-8">4-8</SelectItem><SelectItem value="9-12">9-12</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                         <FormField control={form.control} name="storyLength" render={({ field }) => (<FormItem><FormLabel>Length</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select length" /></SelectTrigger></FormControl><SelectContent><SelectItem value="short">Short</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="long">Long</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                     </div>
                     <FormField control={form.control} name="theme" render={({ field }) => (<FormItem><FormLabel>Theme</FormLabel><Select onValueChange={field.onChange} defaultValue={field.value}><FormControl><SelectTrigger><SelectValue placeholder="Select theme" /></SelectTrigger></FormControl><SelectContent><SelectItem value="adventure">Adventure</SelectItem><SelectItem value="fantasy">Fantasy</SelectItem><SelectItem value="animals">Animals</SelectItem><SelectItem value="friendship">Friendship</SelectItem><SelectItem value="space">Space</SelectItem><SelectItem value="ocean">Ocean</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
                     <FormField control={form.control} name="mainCharacter" render={({ field }) => (<FormItem><FormLabel>Main Character Name <span className="text-xs text-gray-500">(Optional)</span></FormLabel><FormControl><Input placeholder="E.g., Luna, Finn" {...field} value={field.value ?? ""} /></FormControl><FormMessage /></FormItem>)} />
                     <FormField
                        control={form.control}
                        name="educationalFocus"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Educational Focus <span className="text-xs text-gray-500">(Optional)</span></FormLabel>
                            <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select focus (optional)" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {/* Item with value="" removed */}
                                <SelectItem value="kindness">Kindness</SelectItem>
                                <SelectItem value="courage">Courage</SelectItem>
                                <SelectItem value="curiosity">Curiosity</SelectItem>
                                <SelectItem value="perseverance">Perseverance</SelectItem>
                                <SelectItem value="teamwork">Teamwork</SelectItem>
                                <SelectItem value="patience">Patience</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                     <FormField control={form.control} name="additionalInstructions" render={({ field }) => (<FormItem><FormLabel>Additional Instructions <span className="text-xs text-gray-500">(Optional)</span></FormLabel><FormControl><Textarea placeholder="E.g., Include a talking squirrel..." {...field} value={field.value ?? ""} /></FormControl><FormDescription className="text-xs">Max 500 characters.</FormDescription><FormMessage /></FormItem>)} />
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="button"
                      onClick={form.handleSubmit(onGenerateSubmit)}
                      disabled={generateStoryMutation.isPending}
                      className="w-full bg-storytime-purple hover:bg-storytime-purple/90 text-white rounded-full h-11"
                    >
                      {/* MODIFIED: Added estimated time */}
                      {generateStoryMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating... (est. 15-30s)</>
                      ) : (
                        <><Sparkles className="mr-2 h-4 w-4" /> Generate Story {!user ? '(Free)' : ''}</>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </TabsContent>

              <TabsContent value="edit">
                <Card>
                  <CardHeader><div className="flex justify-between items-center"><div><CardTitle>Edit & Preview Story</CardTitle><CardDescription>Make changes to the generated text and title.</CardDescription></div><div className="flex gap-2">
                    {/* Regenerate button */}
                    <Button variant="outline" size="sm" onClick={form.handleSubmit(onGenerateSubmit)} disabled={generateStoryMutation.isPending} title="Regenerate"><RotateCw className="mr-2 h-4 w-4" />Regenerate</Button>
                    {/* Save button */}
                    <Button size="sm" onClick={handleSaveStory} disabled={saveStoryMutation.isPending || !storyContent || !user} className="bg-storytime-green hover:bg-storytime-green/90">
                      {!user ? (<><LogIn className="mr-2 h-4 w-4" /> Login to Save</>) : saveStoryMutation.isPending ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<Save className="mr-2 h-4 w-4" />)}
                      {!user ? '' : generatedStoryId ? 'Update Story' : 'Save Story'}
                    </Button>
                  </div></div></CardHeader>
                  <CardContent>
                    <FormField
                      control={form.control}
                      name="storyTitle"
                      render={({ field }) => (
                        <FormItem className="mb-4">
                          <FormLabel>Story Title (Editable)</FormLabel>
                          <FormControl>
                            <Input placeholder="Generated or your title..." {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {generateStoryMutation.isPending && <div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-storytime-purple"/></div>}
                    {generateStoryMutation.isError && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Error</AlertTitle><AlertDescription>{generateStoryMutation.error.message}</AlertDescription></Alert>}
                    {storyContent && !generateStoryMutation.isPending && (<Textarea value={storyContent} onChange={(e) => setStoryContent(e.target.value)} className="min-h-[460px] font-mono text-sm" placeholder="Your generated story..."/>)}
                    {!storyContent && !generateStoryMutation.isPending && <div className="text-center py-10 text-gray-500">Generate a story first.</div>}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* MODIFIED: Simplified Tab Content Logic */}
              <TabsContent value="voice">
                <Card>
                  <CardHeader><CardTitle>Add Narration</CardTitle></CardHeader>
                  <CardContent>
                    <p className='text-center p-8 text-gray-500'>
                       {/* Placeholder - Actual implementation needed here */}
                       Audio generation and voice selection options will appear here.
                       {user && !generatedStoryId && ' Please save your story first.'}
                       {!user && ' Login or Sign Up to save and add narration.'}
                    </p>
                    {/* Login/Save buttons are handled on the Edit tab */}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="publish">
                <Card>
                  <CardHeader><CardTitle>Publish & Share</CardTitle></CardHeader>
                  <CardContent>
                    <p className='text-center p-8 text-gray-500'>
                       {/* Placeholder - Actual implementation needed here */}
                       Publishing options will appear here once the story is saved.
                       {user && !generatedStoryId && ' Please save your story first.'}
                       {!user && ' Login or Sign Up to save and publish stories.'}
                    </p>
                     {/* Login/Save buttons are handled on the Edit tab */}
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